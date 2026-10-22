"""Admin panel sign-in: users, sessions and permissions.

Requests carry `Authorization: Bearer <token>` from POST /v1/auth/login. The old X-Admin-Key header still works
as a full-access system key (scripts, tests, and creating the very first admin), but people sign in with a
username or email and a password.
"""
import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException, Request

from .models import User, UserSession

# Sections an admin can grant to a psychologist. Admins always have all of them, plus user management.
PERMISSIONS: dict[str, str] = {
    "consent_assigned": "Consent forms assigned to them (view and sign)",
    "consent_manage": "All consent forms (create links, assign psychologists, close links)",
    "overview": "Overview and analytics",
    "orders": "Orders",
    "customers": "Customers",
    "visitors": "Visitors and live activity",
    "partners": "Partner bookings (Ibex)",
    "leads": "Contact messages and corporate leads",
    "catalogue": "Products and payments",
}
DEFAULT_PSYCHOLOGIST_PERMISSIONS = ["consent_assigned"]
ROLES = ("admin", "psychologist")

# Which permission each /v1/admin/... section needs. Anything not listed here (and not checked explicitly in
# its endpoint, like consent forms) is admin-only, so a new endpoint is never accidentally open.
PATH_PERMISSIONS: list[tuple[str, str]] = [
    ("/v1/admin/overview", "overview"),
    ("/v1/admin/analytics", "overview"),
    ("/v1/admin/orders", "orders"),
    ("/v1/admin/customers", "customers"),
    ("/v1/admin/visitors", "visitors"),
    ("/v1/admin/events", "visitors"),
    ("/v1/admin/partner-verifications", "partners"),
    ("/v1/admin/leads", "leads"),
    ("/v1/admin/contact-messages", "leads"),
    ("/v1/admin/products", "catalogue"),
    ("/v1/admin/payments", "catalogue"),
]
SELF_SERVICE_PREFIXES = ("/v1/admin/notifications", "/v1/admin/consent-forms", "/v1/admin/psychologists")

# ---- passwords (scrypt from the standard library: no extra dependency) -----------------------------------
_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(digest)
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                             dklen=len(expected))
        return hmac.compare_digest(got, expected)
    except (ValueError, TypeError):
        return False


_DUMMY_HASH = hash_password(secrets.token_urlsafe(12))


def burn_time(password: str) -> None:
    """Spend the same time as a real check, so unknown usernames can't be found by timing the login."""
    verify_password(password, _DUMMY_HASH)


# ---- sessions --------------------------------------------------------------------------------------------
def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def start_session(user: User, lifetime: timedelta, user_agent: str | None) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await UserSession.create(user_id=user.id, token_hash=token_hash(token), expires_at=now + lifetime,
                             last_seen_at=now, user_agent=(user_agent or "")[:200] or None)
    await User.filter(id=user.id).update(last_login_at=now)
    return token


# ---- who is calling --------------------------------------------------------------------------------------
@dataclass
class Principal:
    user: User | None  # None = the X-Admin-Key system key
    role: str
    permissions: set[str] = field(default_factory=set)
    session_id: str | None = None

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def user_id(self):
        return self.user.id if self.user else None

    def can(self, perm: str) -> bool:
        return self.is_admin or perm in self.permissions


def effective_permissions(user: User) -> list[str]:
    if user.role == "admin":
        return list(PERMISSIONS)
    return [p for p in (user.permissions or []) if p in PERMISSIONS]


def user_out(user: User) -> dict:
    return {"id": str(user.id), "username": user.username, "email": user.email, "name": user.name,
            "role": user.role, "permissions": effective_permissions(user),
            "granted": [p for p in (user.permissions or []) if p in PERMISSIONS],
            "qualification": user.qualification, "is_active": user.is_active,
            "last_login_at": user.last_login_at, "created_at": user.created_at}


async def _from_bearer(token: str) -> Principal | None:
    now = datetime.now(timezone.utc)
    s = await UserSession.filter(token_hash=token_hash(token), expires_at__gt=now).select_related("user").first()
    if s is None or not s.user.is_active:
        return None
    if s.last_seen_at is None or now - s.last_seen_at > timedelta(minutes=5):
        await UserSession.filter(id=s.id).update(last_seen_at=now)
    return Principal(user=s.user, role=s.user.role, permissions=set(effective_permissions(s.user)),
                     session_id=str(s.id))


async def current_principal(request: Request, authorization: str | None = Header(None),
                            x_admin_key: str | None = Header(None)) -> Principal:
    if authorization and authorization.lower().startswith("bearer "):
        p = await _from_bearer(authorization[7:].strip())
        if p:
            request.state.principal = p
            return p
    expected = request.app.state.settings.admin_api_key
    if x_admin_key and hmac.compare_digest(x_admin_key.encode(), expected.encode()):
        p = Principal(user=None, role="admin", permissions=set(PERMISSIONS))
        request.state.principal = p
        return p
    raise HTTPException(401, "Please sign in again.")


async def require_panel_access(request: Request, authorization: str | None = Header(None),
                               x_admin_key: str | None = Header(None)) -> Principal:
    """Router-wide guard for /v1/admin: signed in, and allowed into the section being called."""
    p = await current_principal(request, authorization, x_admin_key)
    path = request.url.path
    if p.is_admin or path.startswith(SELF_SERVICE_PREFIXES):
        return p
    for prefix, perm in PATH_PERMISSIONS:
        if path.startswith(prefix):
            if p.can(perm):
                return p
            break
    raise HTTPException(403, "You don't have access to this section. Ask an admin to grant it.")


def principal(request: Request) -> Principal:
    return request.state.principal


def require(perm: str):
    def dep(request: Request) -> Principal:
        p = principal(request)
        if not p.can(perm):
            raise HTTPException(403, "You don't have access to this. Ask an admin to grant it.")
        return p
    return dep


def require_admin_role(request: Request) -> Principal:
    p = principal(request)
    if not p.is_admin:
        raise HTTPException(403, "Only admins can do this.")
    return p

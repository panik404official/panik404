"""Panel users (admins only) and each user's own notifications.

GET   /v1/admin/users                 everyone, plus the permissions an admin can grant
POST  /v1/admin/users                 create an admin or a psychologist
PATCH /v1/admin/users/{id}            edit, reset password, change role/permissions, switch off
GET   /v1/admin/psychologists         active psychologists, for assigning consent forms
GET   /v1/admin/notifications         my notifications (?unread=true)
GET   /v1/admin/notifications/count   my unread count (the panel polls this)
POST  /v1/admin/notifications/{id}/read, POST /v1/admin/notifications/read-all
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from tortoise.exceptions import IntegrityError
from tortoise.expressions import Q

from ..auth import (DEFAULT_PSYCHOLOGIST_PERMISSIONS, PERMISSIONS, ROLES, Principal, hash_password, principal,
                    require, require_admin_role, require_panel_access, user_out)
from ..models import Notification, User, UserSession
from ..schemas import UserCreate, UserUpdate

router = APIRouter(prefix="/v1/admin", tags=["users"], dependencies=[Depends(require_panel_access)])


def _clean_perms(perms: list[str] | None, role: str) -> list[str]:
    if role == "admin":
        return []  # admins have everything anyway
    if perms is None:
        return list(DEFAULT_PSYCHOLOGIST_PERMISSIONS)
    unknown = [x for x in perms if x not in PERMISSIONS]
    if unknown:
        raise HTTPException(422, f"Unknown permission: {', '.join(unknown)}")
    return sorted(set(perms))


async def _taken(username: str | None, email: str | None, exclude: UUID | None = None) -> None:
    for field, value, label in (("username", username, "username"), ("email", email, "email")):
        if value is None:
            continue
        qs = User.filter(**{field: value})
        if exclude:
            qs = qs.exclude(id=exclude)
        if await qs.exists():
            raise HTTPException(409, f"That {label} is already used by another account.")


@router.get("/users", dependencies=[Depends(require_admin_role)])
async def list_users(q: str | None = Query(None, max_length=200)):
    qs = User.all()
    if q and q.strip():
        t = q.strip()
        qs = qs.filter(Q(name__icontains=t) | Q(username__icontains=t) | Q(email__icontains=t))
    users = await qs.order_by("-is_active", "role", "name")
    return {"items": [user_out(u) for u in users], "roles": list(ROLES),
            "permissions": [{"key": k, "label": v} for k, v in PERMISSIONS.items()],
            "default_psychologist_permissions": DEFAULT_PSYCHOLOGIST_PERMISSIONS}


@router.post("/users", status_code=201)
async def create_user(body: UserCreate, p: Principal = Depends(require_admin_role)):
    await _taken(body.username, str(body.email))
    try:
        u = await User.create(username=body.username, email=str(body.email), name=body.name.strip(),
                              role=body.role, permissions=_clean_perms(body.permissions, body.role),
                              qualification=(body.qualification or "").strip() or None,
                              password_hash=hash_password(body.password), created_by_id=p.user_id)
    except IntegrityError as e:
        raise HTTPException(409, "That username or email is already used by another account.") from e
    return user_out(u)


@router.patch("/users/{user_id}")
async def update_user(user_id: UUID, body: UserUpdate, p: Principal = Depends(require_admin_role)):
    u = await User.get_or_none(id=user_id)
    if u is None:
        raise HTTPException(404, "User not found")
    sent = body.model_fields_set
    is_self = p.user_id == u.id
    becomes_non_admin = ("role" in sent and body.role != "admin") or ("is_active" in sent and not body.is_active)
    if u.role == "admin" and becomes_non_admin:
        if is_self:
            raise HTTPException(409, "You can't remove your own admin access or switch yourself off.")
        if await User.filter(role="admin", is_active=True).exclude(id=u.id).count() == 0:
            raise HTTPException(409, "At least one active admin must remain.")
    await _taken(body.username if "username" in sent else None, str(body.email) if body.email else None, u.id)

    if body.name is not None:
        u.name = body.name.strip()
    if body.username is not None:
        u.username = body.username
    if body.email is not None:
        u.email = str(body.email)
    if "qualification" in sent:
        u.qualification = (body.qualification or "").strip() or None
    if body.role is not None:
        u.role = body.role
    if "permissions" in sent or "role" in sent:
        u.permissions = _clean_perms(body.permissions if "permissions" in sent else u.permissions, u.role)
    signout = False
    if body.password is not None:
        u.password_hash, signout = hash_password(body.password), True
    if body.is_active is not None:
        u.is_active = body.is_active
        signout = signout or not body.is_active
    try:
        await u.save()
    except IntegrityError as e:
        raise HTTPException(409, "That username or email is already used by another account.") from e
    if signout:
        await UserSession.filter(user_id=u.id).delete()
    return user_out(u)


@router.get("/psychologists", dependencies=[Depends(require("consent_manage"))])
async def psychologists():
    users = await User.filter(role="psychologist", is_active=True).order_by("name")
    return {"items": [{"id": str(u.id), "name": u.name, "email": u.email, "qualification": u.qualification}
                      for u in users]}


# ---- notifications (everyone sees only their own) ----------------------------------------------------
@router.get("/notifications")
async def my_notifications(request: Request, unread: bool = False, limit: int = Query(50, ge=1, le=200)):
    p = principal(request)
    if p.user is None:
        return {"items": [], "unread": 0}
    qs = Notification.filter(user_id=p.user.id)
    if unread:
        qs = qs.filter(read_at__isnull=True)
    rows = await qs.order_by("-created_at").limit(limit).values(
        "id", "kind", "title", "body", "link", "read_at", "created_at")
    count = await Notification.filter(user_id=p.user.id, read_at__isnull=True).count()
    return {"items": rows, "unread": count}


@router.get("/notifications/count")
async def my_unread_count(request: Request):
    p = principal(request)
    if p.user is None:
        return {"unread": 0}
    return {"unread": await Notification.filter(user_id=p.user.id, read_at__isnull=True).count()}


@router.post("/notifications/read-all")
async def read_all(request: Request):
    p = principal(request)
    if p.user:
        await Notification.filter(user_id=p.user.id, read_at__isnull=True).update(read_at=datetime.now(timezone.utc))
    return {"unread": 0}


@router.post("/notifications/{nid}/read")
async def read_one(nid: UUID, request: Request):
    p = principal(request)
    if p.user is None:
        raise HTTPException(404, "Notification not found")
    n = await Notification.filter(id=nid, user_id=p.user.id).update(read_at=datetime.now(timezone.utc))
    if not n:
        raise HTTPException(404, "Notification not found")
    return {"ok": True}

"""Consent forms opened through admin-generated links.

Flow: open (client fills, autosaved) -> submitted (client pressed Save; admins are notified) -> an admin assigns a
psychologist (they are notified) -> completed (the psychologist signs in the panel; the signed PDF is emailed).

The link token is the only key to a form, so anyone holding the link can read and fill it (that is how the
client and the psychologist share one form). A revoked or expired link stops working everywhere at once.
"""
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from tortoise import connections
from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from ..models import ConsentForm, User
from ..schemas import ConsentCreate

SIG_FIELDS = ("sig_client", "sig_psych", "sig_guardian")
PSYCH_FIELDS = ("pname", "pqual", "sig_psych")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class ConsentError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code, self.message = status_code, message


def now() -> datetime:
    return datetime.now(timezone.utc)


def is_expired(form: ConsentForm, at: datetime | None = None) -> bool:
    return form.expires_at is not None and form.expires_at <= (at or now())


def link_active(form: ConsentForm) -> bool:
    return form.status != "revoked" and not is_expired(form)


def state(form: ConsentForm) -> str:
    """What the panel shows: revoked, expired (a link that ran out before the client saved), open, submitted
    (client saved, waiting for the psychologist) or completed."""
    if form.status == "revoked":
        return "revoked"
    if form.status == "open" and is_expired(form):
        return "expired"
    return form.status


def _check_open_link(form: ConsentForm | None) -> ConsentForm:
    if form is None:
        raise ConsentError(404, "This consent form link is not valid. Check the link or ask Panik for a new one.")
    if form.status == "revoked":
        raise ConsentError(410, "This consent form link has been closed by Panik. Ask Panik for a new link.")
    if is_expired(form):
        raise ConsentError(410, "This consent form link has expired. Ask Panik for a new link.")
    return form


def public_view(form: ConsentForm) -> dict[str, Any]:
    return {"status": form.status, "data": form.data or {}, "reference": form.reference,
            "submitted_at": form.submitted_at, "completed_at": form.completed_at, "expires_at": form.expires_at,
            "emailed": form.emailed_at is not None}


# ---- public ------------------------------------------------------------------------------------------
async def open_form(token: str) -> ConsentForm:
    form = _check_open_link(await ConsentForm.get_or_none(token=token))
    t = now()
    form.first_opened_at = form.first_opened_at or t
    form.last_opened_at = t
    await ConsentForm.filter(id=form.id).update(first_opened_at=form.first_opened_at, last_opened_at=t)
    return form


async def save_fields(token: str, fields: dict[str, Any]) -> datetime:
    """Merges the changed fields into the stored form in one atomic statement, so two people typing into
    different fields of the same link never overwrite each other."""
    if not fields:
        return now()
    rows = await connections.get("default").execute_query_dict(
        """UPDATE consent_forms SET data = data || $1::jsonb, updated_at = now()
           WHERE token = $2 AND status = 'open' AND (expires_at IS NULL OR expires_at > now())
           RETURNING updated_at""",
        [json.dumps(fields), token])
    if rows:
        return rows[0]["updated_at"]
    form = _check_open_link(await ConsentForm.get_or_none(token=token))
    if form.status in ("submitted", "completed"):
        raise ConsentError(409, "This form was already saved and can no longer be changed.")
    raise ConsentError(409, "This form could not be saved. Reload the page and try again.")


def _text(d, k):
    return str(d.get(k) or "").strip()


def client_missing(d: dict[str, Any]) -> list[str]:
    """What the client must fill before pressing Save."""
    def digits(k):
        return len(re.sub(r"\D", "", _text(d, k)))

    checks = {
        "name": bool(_text(d, "name")), "dob": bool(_text(d, "dob")), "phone": digits("phone") >= 7,
        "email": bool(EMAIL_RE.match(_text(d, "email"))), "ename": bool(_text(d, "ename")),
        "ephone": digits("ephone") >= 7, "session_time": bool(_text(d, "session_time")), "ack": d.get("ack") is True,
        "sig_client": bool(d.get("sig_client")),
    }
    if d.get("gneed"):
        checks.update(gname=bool(_text(d, "gname")), grel=bool(_text(d, "grel")),
                      sig_guardian=bool(d.get("sig_guardian")))
    return [k for k, ok in checks.items() if not ok]


def psych_missing(d: dict[str, Any]) -> list[str]:
    return [k for k, ok in {"pname": bool(_text(d, "pname")), "sig_psych": bool(d.get("sig_psych"))}.items() if not ok]


async def submit(token: str, fields: dict[str, Any]) -> ConsentForm:
    """The client pressed Save: check their part, then lock the form for the psychologist."""
    fields = {k: v for k, v in fields.items() if k not in PSYCH_FIELDS}  # the psychologist fills these in the panel
    async with in_transaction():
        form = _check_open_link(await ConsentForm.filter(token=token).select_for_update().first())
        if form.status != "open":
            raise ConsentError(409, "This form was already saved.")
        data = {**(form.data or {}), **fields}
        missing = client_missing(data)
        if missing:
            raise ConsentError(422, "Some required fields are missing: " + ", ".join(missing))
        form.data, form.status, form.submitted_at = data, "submitted", now()
        await form.save(update_fields=["data", "status", "submitted_at", "updated_at"])
    return form


async def completed_for_email(form_id: UUID) -> ConsentForm:
    form = await ConsentForm.get_or_none(id=form_id)
    if form is None:
        raise ConsentError(404, "Consent form not found")
    if form.status != "completed":
        raise ConsentError(409, "Sign the form before emailing it.")
    if form.emailed_at:
        raise ConsentError(409, "This signed form was already emailed.")
    return form


async def mark_emailed(form: ConsentForm) -> None:
    await ConsentForm.filter(id=form.id, emailed_at__isnull=True).update(emailed_at=now())


# ---- admin ----------------------------------------------------------------------------------------------
def admin_row(form: ConsentForm, full: bool = False) -> dict[str, Any]:
    d = form.data or {}
    assignee = form.assigned_to if form.assigned_to_id else None
    row = {
        "id": str(form.id), "token": form.token, "status": form.status, "state": state(form),
        "link_active": link_active(form) and form.status == "open", "note": form.note, "reference": form.reference,
        "client_name": d.get("name"), "client_email": d.get("email"), "session_time": d.get("session_time"),
        "psychologist": d.get("pname"), "created_at": form.created_at, "updated_at": form.updated_at,
        "expires_at": form.expires_at, "first_opened_at": form.first_opened_at,
        "last_opened_at": form.last_opened_at, "submitted_at": form.submitted_at, "completed_at": form.completed_at,
        "revoked_at": form.revoked_at, "emailed_at": form.emailed_at, "assigned_at": form.assigned_at,
        "assigned_to": {"id": str(assignee.id), "name": assignee.name, "qualification": assignee.qualification}
        if assignee else None,
        "signatures": [k for k in SIG_FIELDS if d.get(k)],
    }
    if full:
        row["data"] = d
    return row


async def _psychologist(user_id: UUID) -> User:
    u = await User.get_or_none(id=user_id)
    if u is None or not u.is_active or u.role != "psychologist":
        raise ConsentError(422, "Choose an active psychologist.")
    return u


async def create(body: ConsentCreate, by: UUID | None) -> ConsentForm:
    expires = now() + timedelta(days=body.expires_in_days) if body.expires_in_days else None
    data = {k: v for k, v in body.prefill.model_dump(exclude_none=True).items() if v != "" and k not in PSYCH_FIELDS}
    assignee = await _psychologist(body.assign_to) if body.assign_to else None
    form = await ConsentForm.create(token=secrets.token_urlsafe(24), note=body.note or None, data=data,
                                    expires_at=expires, assigned_to_id=assignee.id if assignee else None,
                                    assigned_by_id=by if assignee else None, assigned_at=now() if assignee else None)
    return await get(form.id)


async def list_forms(state_filter: str | None, q: str | None, limit: int, only_for: UUID | None) -> list[dict]:
    qs = ConsentForm.all().select_related("assigned_to")
    if only_for:
        qs = qs.filter(assigned_to_id=only_for)
    t = now()
    if state_filter == "revoked":
        qs = qs.filter(status="revoked")
    elif state_filter in ("completed", "submitted"):
        qs = qs.filter(status=state_filter)
    elif state_filter == "open":
        qs = qs.filter(Q(status="open") & (Q(expires_at__isnull=True) | Q(expires_at__gt=t)))
    elif state_filter == "expired":
        qs = qs.filter(status="open", expires_at__lte=t)
    elif state_filter == "unassigned":
        qs = qs.filter(status__in=["open", "submitted"], assigned_to_id__isnull=True)
    rows = await qs.order_by("-created_at").limit(500 if q else limit)
    if q and q.strip():
        needle = q.strip().lower()
        rows = [r for r in rows if needle in " ".join(
            str(x or "") for x in (r.note, r.reference, (r.data or {}).get("name"), (r.data or {}).get("email"),
                                   (r.data or {}).get("phone"))).lower()][:limit]
    return [admin_row(r) for r in rows]


async def get(form_id: UUID) -> ConsentForm | None:
    return await ConsentForm.filter(id=form_id).select_related("assigned_to").first()


async def revoke(form_id: UUID) -> ConsentForm:
    form = await get(form_id)
    if form is None:
        raise ConsentError(404, "Consent form not found")
    if form.status != "revoked":
        form.status, form.revoked_at = "revoked", now()
        await form.save(update_fields=["status", "revoked_at", "updated_at"])
    return form


async def assign(form_id: UUID, user_id: UUID | None, by: UUID | None) -> tuple[ConsentForm, User | None]:
    form = await get(form_id)
    if form is None:
        raise ConsentError(404, "Consent form not found")
    if form.status in ("completed", "revoked"):
        raise ConsentError(409, "A signed or closed form can't be reassigned.")
    assignee = await _psychologist(user_id) if user_id else None
    form.assigned_to_id = assignee.id if assignee else None
    form.assigned_by_id = by if assignee else None
    form.assigned_at = now() if assignee else None
    await form.save(update_fields=["assigned_to_id", "assigned_by_id", "assigned_at", "updated_at"])
    return await get(form_id), assignee


async def reopen(form_id: UUID) -> ConsentForm:
    """Send a saved form back to the client (for example, to correct a detail). Their link works again."""
    form = await get(form_id)
    if form is None:
        raise ConsentError(404, "Consent form not found")
    if form.status != "submitted":
        raise ConsentError(409, "Only a form the client saved, and nobody signed yet, can be reopened.")
    form.status, form.submitted_at = "open", None
    await form.save(update_fields=["status", "submitted_at", "updated_at"])
    return form


async def sign(form_id: UUID, fields: dict[str, Any]) -> ConsentForm:
    async with in_transaction():
        form = await ConsentForm.filter(id=form_id).select_for_update().first()
        if form is None:
            raise ConsentError(404, "Consent form not found")
        if form.status != "submitted":
            raise ConsentError(409, "Only a form the client has saved can be signed." if form.status == "open"
                               else "This form can't be signed any more.")
        data = {**(form.data or {}), **fields}
        missing = client_missing(data) + psych_missing(data)
        if missing:
            raise ConsentError(422, "Some required fields are missing: " + ", ".join(missing))
        form.data, form.status, form.completed_at = data, "completed", now()
        form.reference = "PNK-" + secrets.token_hex(4).upper()
        await form.save(update_fields=["data", "status", "completed_at", "reference", "updated_at"])
    return await get(form_id)

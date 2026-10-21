"""Consent forms opened through admin-generated links.

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

from ..models import ConsentForm
from ..schemas import ConsentCreate

SIG_FIELDS = ("sig_client", "sig_psych", "sig_guardian")
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
    """What the admin sees: revoked, expired (an unsigned link that ran out), completed or open."""
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
            "completed_at": form.completed_at, "expires_at": form.expires_at, "emailed": form.emailed_at is not None}


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
    if form.status == "completed":
        raise ConsentError(409, "This form is already signed and can no longer be changed.")
    raise ConsentError(409, "This form could not be saved. Reload the page and try again.")


def missing_fields(d: dict[str, Any]) -> list[str]:
    def text(k):
        return str(d.get(k) or "").strip()

    def digits(k):
        return len(re.sub(r"\D", "", text(k)))

    checks = {
        "name": bool(text("name")), "dob": bool(text("dob")), "phone": digits("phone") >= 7,
        "email": bool(EMAIL_RE.match(text("email"))), "ename": bool(text("ename")), "ephone": digits("ephone") >= 7,
        "session_time": bool(text("session_time")), "ack": d.get("ack") is True, "sig_client": bool(d.get("sig_client")),
        "pname": bool(text("pname")), "sig_psych": bool(d.get("sig_psych")),
    }
    if d.get("gneed"):
        checks.update(gname=bool(text("gname")), grel=bool(text("grel")), sig_guardian=bool(d.get("sig_guardian")))
    return [k for k, ok in checks.items() if not ok]


async def submit(token: str, fields: dict[str, Any]) -> ConsentForm:
    async with in_transaction():
        form = _check_open_link(await ConsentForm.filter(token=token).select_for_update().first())
        if form.status == "completed":
            raise ConsentError(409, "This form is already signed.")
        data = {**(form.data or {}), **fields}
        missing = missing_fields(data)
        if missing:
            raise ConsentError(422, "Some required fields are missing: " + ", ".join(missing))
        t = now()
        form.data, form.status, form.completed_at = data, "completed", t
        form.reference = "PNK-" + secrets.token_hex(4).upper()
        await form.save(update_fields=["data", "status", "completed_at", "reference", "updated_at"])
    return form


async def completed_for_email(token: str) -> ConsentForm:
    form = _check_open_link(await ConsentForm.get_or_none(token=token))
    if form.status != "completed":
        raise ConsentError(409, "Sign the form before emailing it.")
    if form.emailed_at:
        raise ConsentError(409, "This signed form was already emailed.")
    return form


async def mark_emailed(form: ConsentForm) -> None:
    await ConsentForm.filter(id=form.id, emailed_at__isnull=True).update(emailed_at=now())


# ---- admin -------------------------------------------------------------------------------------------
def admin_row(form: ConsentForm, full: bool = False) -> dict[str, Any]:
    d = form.data or {}
    row = {
        "id": str(form.id), "token": form.token, "status": form.status, "state": state(form),
        "link_active": link_active(form), "note": form.note, "reference": form.reference,
        "client_name": d.get("name"), "client_email": d.get("email"), "session_time": d.get("session_time"),
        "psychologist": d.get("pname"), "created_at": form.created_at, "updated_at": form.updated_at,
        "expires_at": form.expires_at, "first_opened_at": form.first_opened_at,
        "last_opened_at": form.last_opened_at, "completed_at": form.completed_at,
        "revoked_at": form.revoked_at, "emailed_at": form.emailed_at,
        "signatures": [k for k in SIG_FIELDS if d.get(k)],
    }
    if full:
        row["data"] = d
    return row


async def create(body: ConsentCreate) -> ConsentForm:
    expires = now() + timedelta(days=body.expires_in_days) if body.expires_in_days else None
    data = {k: v for k, v in body.prefill.model_dump(exclude_none=True).items() if v != ""}
    return await ConsentForm.create(token=secrets.token_urlsafe(24), note=body.note or None, data=data,
                                    expires_at=expires)


async def list_forms(state_filter: str | None, q: str | None, limit: int) -> list[dict]:
    qs = ConsentForm.all()
    t = now()
    if state_filter == "revoked":
        qs = qs.filter(status="revoked")
    elif state_filter == "completed":
        qs = qs.filter(status="completed")
    elif state_filter == "open":
        qs = qs.filter(Q(status="open") & (Q(expires_at__isnull=True) | Q(expires_at__gt=t)))
    elif state_filter == "expired":
        qs = qs.filter(status="open", expires_at__lte=t)
    rows = await qs.order_by("-created_at").limit(500 if q else limit)
    if q and q.strip():
        needle = q.strip().lower()
        rows = [r for r in rows if needle in " ".join(
            str(x or "") for x in (r.note, r.reference, (r.data or {}).get("name"), (r.data or {}).get("email"),
                                   (r.data or {}).get("phone"))).lower()][:limit]
    return [admin_row(r) for r in rows]


async def get(form_id: UUID) -> ConsentForm | None:
    return await ConsentForm.get_or_none(id=form_id)


async def revoke(form_id: UUID) -> ConsentForm:
    form = await ConsentForm.get_or_none(id=form_id)
    if form is None:
        raise ConsentError(404, "Consent form not found")
    if form.status != "revoked":
        form.status, form.revoked_at = "revoked", now()
        await form.save(update_fields=["status", "revoked_at", "updated_at"])
    return form

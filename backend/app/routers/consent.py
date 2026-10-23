"""Public side of the consent forms. The link token in the URL is the only credential.

GET    /v1/consent/{token}          load the form (404 unknown link, 410 closed or expired link)
PATCH  /v1/consent/{token}          autosave: only the changed fields are sent and merged
POST   /v1/consent/{token}/submit   the client's Save: checks their part, locks the form, notifies the admins
                                    (and the assigned psychologist, if one was chosen already)

The psychologist signs in the panel afterwards (POST /v1/admin/consent-forms/{id}/sign), which is also where the
signed PDF gets emailed. send_signed_copy() below does that emailing.
"""
import logging
import smtplib
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Request

from ..config import Settings
from ..mailer import Attachment, Mail, MailNotConfigured, send_mail
from ..models import ConsentForm
from ..notify import notify, users_who_can
from ..repos import consent as repo, meetings as meetings_repo
from ..schemas import ConsentData
from ..security import limit

log = logging.getLogger("consent")
router = APIRouter(prefix="/v1/consent", tags=["consent"], dependencies=[Depends(limit("consent"))])
Token = Annotated[str, Path(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]


def _raise(e: repo.ConsentError):
    raise HTTPException(e.status_code, e.message) from e


@router.get("/{token}")
async def load(token: Token):
    try:
        return repo.public_view(await repo.open_form(token))
    except repo.ConsentError as e:
        _raise(e)


@router.patch("/{token}")
async def autosave(body: ConsentData, token: Token):
    try:
        return {"saved_at": await repo.save_fields(token, body.model_dump(exclude_unset=True))}
    except repo.ConsentError as e:
        _raise(e)


@router.post("/{token}/submit")
async def submit(body: ConsentData, token: Token, request: Request, background: BackgroundTasks):
    try:
        form = await repo.submit(token, body.model_dump(exclude_unset=True))
    except repo.ConsentError as e:
        _raise(e)
    s: Settings = request.app.state.settings
    d = form.data or {}
    who = d.get("name") or "A client"
    link = f"/admin/consent/{form.id}"
    session = d.get("session_time", "").replace("T", " ") or "no time given"
    await notify(s, background, await users_who_can("consent_manage"), kind="consent_submitted",
                 title=f"{who} filled the consent form",
                 body=f"{who} saved their consent form (session {session}). "
                      + ("Assign a psychologist to review and sign it." if not form.assigned_to_id else
                         "It is already assigned to a psychologist."),
                 link=link)
    if form.assigned_to_id:
        await form.fetch_related("assigned_to")
        await notify(s, background, [form.assigned_to], kind="consent_ready",
                     title=f"{who}'s consent form is ready for you",
                     body=f"{who} filled the consent form assigned to you. Review it and add your signature.",
                     link=link)
        # Saved and already assigned: create the Google Meet link and email it (after the response, so the
        # client never waits on Google).
        background.add_task(meetings_repo.sync_later, s, form.id)
    return repo.public_view(form)


async def send_signed_copy(s: Settings, form: ConsentForm, content: bytes) -> list[str]:
    """Emails the signed PDF to Panik (CONSENT_EMAIL) and to the client. Raises HTTPException on failure."""
    if len(content) > s.receipt_max_bytes:
        raise HTTPException(413, "The PDF is too large.")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(415, "The signed copy must be a PDF.")

    d = form.data or {}
    name, client_email = d.get("name") or "Client", d.get("email")
    attachment = Attachment(f"Panik-Consent-{form.reference}.pdf", content, "application/pdf")
    mails = [Mail(
        to=s.consent_email or s.admin_email,
        reply_to=client_email or None,
        subject=f"Signed consent form {form.reference} - {name}",
        text="\n".join([
            "A consent form was signed. The signed PDF is attached and every answer is saved in the admin panel.", "",
            f"Client: {name}", f"Email: {client_email or '(none)'}", f"Phone: {d.get('phone') or '(none)'}",
            f"Session: {d.get('session_time') or '(none)'}", f"Psychologist: {d.get('pname') or '(none)'}",
            f"Reference: {form.reference}",
        ]),
        attachments=[attachment],
    )]
    if client_email and repo.EMAIL_RE.match(client_email):
        mails.append(Mail(
            to=client_email,
            subject="Your signed Panik consent form",
            text="\n".join([
                f"Hello {name},", "",
                "Your informed consent form has been signed by you and your psychologist. "
                "Your signed copy is attached for your records.",
                f"Reference: {form.reference}", "",
                "If you have any questions about the form, reply to this email.",
            ]),
            attachments=[attachment],
        ))
    try:
        await send_mail(s, *mails)
    except MailNotConfigured as e:
        raise HTTPException(503, "Email delivery is not configured yet.") from e
    except (smtplib.SMTPException, OSError) as e:
        log.error("consent email delivery failed: %s", e)
        raise HTTPException(502, "We could not send the email. Download the PDF and send it instead.") from e
    await repo.mark_emailed(form)
    return [m.to for m in mails]

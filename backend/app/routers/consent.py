"""Public side of the consent forms. The link token in the URL is the only credential.

GET    /v1/consent/{token}          load the form (404 unknown link, 410 closed or expired link)
PATCH  /v1/consent/{token}          autosave: only the changed fields are sent and merged
POST   /v1/consent/{token}/submit   final save + required-field check; locks the form as signed
POST   /v1/consent/{token}/email    multipart "pdf": emails the signed copy to Panik and the client (once)
"""
import logging
import smtplib
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Path, Request, UploadFile

from ..config import Settings
from ..mailer import Attachment, Mail, MailNotConfigured, send_mail
from ..repos import consent as repo
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
async def submit(body: ConsentData, token: Token):
    try:
        form = await repo.submit(token, body.model_dump(exclude_unset=True))
    except repo.ConsentError as e:
        _raise(e)
    return repo.public_view(form)


@router.post("/{token}/email")
async def email_copy(request: Request, token: Token, pdf: UploadFile = File(...)):
    s: Settings = request.app.state.settings
    try:
        form = await repo.completed_for_email(token)
    except repo.ConsentError as e:
        _raise(e)
    content = await pdf.read(s.receipt_max_bytes + 1)
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
                "Thank you for signing your informed consent form. Your signed copy is attached for your records.",
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
        raise HTTPException(502, "We could not send the email. Save the PDF and email it to Panik instead.") from e
    await repo.mark_emailed(form)
    return {"message": "Signed copy emailed.", "to": [m.to for m in mails]}

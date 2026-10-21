"""Contact us: the message is kept for the admin panel, emailed to the team, and the sender gets a confirmation.

Works like the gift / booking requests: if the email cannot be sent, nothing is kept, so the visitor can simply
press Send again without leaving a duplicate behind.
"""
import logging
import smtplib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from ..config import Settings
from ..context import build_ctx
from ..mailer import Mail, MailNotConfigured, send_mail
from ..models import ContactMessage
from ..repos.tracking import ensure_visitor_session
from ..schemas import ContactIn
from ..security import limit

log = logging.getLogger("contact")
router = APIRouter(prefix="/v1", tags=["contact"], dependencies=[Depends(limit("contact"))])


@router.post("/contact", status_code=201)
async def contact(body: ContactIn, request: Request):
    s: Settings = request.app.state.settings
    visitor_id = None
    if body.visitor_id and body.session_id:
        ctx = build_ctx(request, body.context, fallback_path="/contact")
        await ensure_visitor_session(body.visitor_id, body.session_id, ctx, datetime.now(timezone.utc))
        visitor_id = body.visitor_id
    msg = await ContactMessage.create(visitor_id=visitor_id, name=body.name, email=str(body.email),
                                      phone=body.phone or None, topic=body.topic, message=body.message)

    team = Mail(
        to=s.contact_email or s.admin_email,
        reply_to=str(body.email),
        subject=f"Contact form: {body.topic} from {body.name}",
        text="\n".join([
            "A new message was sent from the Contact us page.", "",
            f"Name: {body.name}",
            f"Email: {body.email}",
            f"Phone: {body.phone or '(none)'}",
            f"Topic: {body.topic}", "",
            "Message:", body.message, "",
            "Reply to this email to answer them directly.",
        ]),
    )
    sender = Mail(
        to=str(body.email),
        subject="We received your message - Panik",
        text="\n".join([
            f"Hello {body.name},", "",
            "Thank you for contacting Panik. We received your message and will reply to this email address.", "",
            f"Topic: {body.topic}",
            "Your message:", body.message, "",
            "Panik is not an emergency or crisis-response service. If you or someone else is in immediate danger, "
            "contact local emergency services or go to the nearest emergency department now. "
            "Do not wait for a reply from us.",
        ]),
    )
    try:
        await send_mail(s, team, sender)
    except MailNotConfigured as e:
        await msg.delete()
        raise HTTPException(503, "Email delivery is not configured yet.") from e
    except (smtplib.SMTPException, OSError) as e:
        await msg.delete()
        log.error("contact email delivery failed: %s", e)
        raise HTTPException(502, "We could not send your message. Please try again later.") from e
    return {"message": "Message sent.", "id": str(msg.id)}

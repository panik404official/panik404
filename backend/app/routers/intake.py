"""Gift and booking requests: email the team (and the customer / gift recipient) with the payment receipt.

Replaces the old Express mail server (server/index.js). The order must already exist (POST /v1/orders);
these endpoints only attach the receipt and the extra details, then send the emails.
"""
import logging
import re
import smtplib
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ValidationError

from .. import cloud
from ..config import Settings
from ..mailer import Attachment, Mail, MailNotConfigured, send_mail
from ..models import Order, PartnerVerification
from ..schemas import BookingRequestIn, GiftRequestIn
from ..security import limit
from ..voucher import make_gift_voucher_pdf

log = logging.getLogger("intake")
router = APIRouter(prefix="/v1", tags=["requests"], dependencies=[Depends(limit("intake"))])

ORDER_MAX_AGE = timedelta(days=7)
# Detected from the file's first bytes; the browser-supplied content type is not trusted.
SIGNATURES = [
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"GIF87a", "image/gif", "gif"),
    (b"GIF89a", "image/gif", "gif"),
    (b"%PDF-", "application/pdf", "pdf"),
]


def _parse(model: type[BaseModel], raw: str):
    try:
        return model.model_validate_json(raw)
    except ValidationError as e:
        raise RequestValidationError(e.errors(include_url=False)) from e


async def _read_receipt(receipt: UploadFile, max_bytes: int) -> Attachment:
    content = await receipt.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(413, f"The receipt must be smaller than {max_bytes // (1024 * 1024)} MB.")
    if not content:
        raise HTTPException(422, "The receipt file is empty.")
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        mime, ext = "image/webp", "webp"
    else:
        match = next(((m, e) for sig, m, e in SIGNATURES if content.startswith(sig)), None)
        if not match:
            raise HTTPException(415, "Upload the receipt as an image (PNG, JPG, GIF, WebP) or a PDF.")
        mime, ext = match
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", (receipt.filename or "receipt").rsplit(".", 1)[0]).strip("-.")
    return Attachment(filename=f"{(stem or 'receipt')[:80]}.{ext}", content=content, mime=mime)


async def _pending_order(order_id, kind: str) -> Order:
    order = await Order.get_or_none(id=order_id, kind=kind).prefetch_related("customer", "items")
    if order is None:
        raise HTTPException(404, "Order not found.")
    if order.status != "pending" or datetime.now(timezone.utc) - order.created_at > ORDER_MAX_AGE:
        raise HTTPException(409, "This order can no longer be updated. Please start a new one.")
    if order.details.get("request_submitted_at"):
        raise HTTPException(409, "This request was already submitted.")
    return order


async def _send(s: Settings, kind: str, *mails: Mail) -> None:
    try:
        await send_mail(s, *mails)
    except MailNotConfigured as e:
        raise HTTPException(503, "Email delivery is not configured yet.") from e
    except (smtplib.SMTPException, OSError) as e:
        log.error("%s email delivery failed: %s", kind, e)
        raise HTTPException(502, "We could not send the email. Please try again later.") from e


async def _store_receipt(s: Settings, order: Order, receipt: Attachment) -> dict:
    """Uploads the receipt to Cloudinary so the panel can show it. Best effort: if storage is down or not set up,
    the request still goes through (the team gets the receipt by email either way)."""
    meta = {"filename": receipt.filename, "content_type": receipt.mime, "bytes": len(receipt.content)}
    try:
        meta["stored"] = await cloud.upload_receipt(s, receipt.content, receipt.mime, f"order-{order.order_no}")
    except cloud.StorageNotConfigured:
        log.warning("receipt for order #%s not stored: Cloudinary is not configured", order.order_no)
        meta["store_error"] = "Cloudinary is not configured"
    except Exception as e:  # noqa: BLE001 - never lose the booking because the image host failed
        log.exception("receipt upload failed for order #%s", order.order_no)
        meta["store_error"] = str(e)[:200] or e.__class__.__name__
    return meta


def _coupon_text(order: Order, typed: str | None = None) -> str:
    """The coupon applied to the order's price; or what an older page typed (not applied) for the team to see."""
    d = order.details or {}
    if d.get("coupon"):
        return f"{d['coupon']} ({d.get('coupon_label')}, saved {_rs(Decimal(d.get('coupon_discount') or 0))})"
    return f"{typed} (typed but not applied: not a valid coupon)" if typed else "(none)"


async def _mark_submitted(order: Order, receipt: dict, typed_coupon: str | None) -> None:
    order.details = {
        **order.details,
        "request_submitted_at": datetime.now(timezone.utc).isoformat(),
        "receipt": receipt,
    }
    if typed_coupon and not order.details.get("coupon"):
        order.details["coupon_typed"] = typed_coupon
    await order.save(update_fields=["details", "updated_at"])


def _rs(amount) -> str:
    return f"Rs {amount:,.0f}"


@router.post("/gifts/request")
async def gift_request(request: Request, data: str = Form(...), receipt: UploadFile = File(...)):
    s: Settings = request.app.state.settings
    body: GiftRequestIn = _parse(GiftRequestIn, data)
    proof = await _read_receipt(receipt, s.receipt_max_bytes)
    order = await _pending_order(body.order_id, "gift")

    d, buyer = order.details, order.customer
    sessions = order.items[0].quantity if order.items else 1
    who, how, message = d.get("recipient") or "your friend", d.get("delivery", "email"), d.get("message")
    to = d.get("recipient_email") if how == "email" else d.get("address")
    admin_attachments = [proof]
    mails = []
    if how == "email" and to:
        pdf = Attachment("panik-session-gift-request.pdf",
                         make_gift_voucher_pdf(who=who, message=message, how=how, sessions=sessions, total=order.total),
                         "application/pdf")
        admin_attachments.append(pdf)
        mails.append(Mail(
            to=to,
            subject="A Panik session gift request is ready",
            text="\n".join([
                f"Hello {who},", "",
                f"{buyer.name or 'Someone'} has prepared a Panik session gift request for you. "
                "The attached PDF is a copy of the request.",
                f"Sessions: {sessions}",
                f"Message: {message or '(no personal message)'}", "",
                "The PDF is not redeemable and is not a payment receipt. "
                "Panik will confirm the gift after payment is verified.",
            ]),
            attachments=[pdf],
        ))
    mails.insert(0, Mail(
        to=s.admin_email,
        reply_to=buyer.email,
        subject=f"Gift order #{order.order_no} for {who}: payment receipt attached",
        text="\n".join([
            f"Gift order #{order.order_no} was submitted with a payment receipt.", "",
            f"From: {buyer.name or '(no name)'} <{buyer.email}>",
            f"Recipient: {who}",
            f"Delivery: {'Email' if how == 'email' else 'Post'}",
            f"{'Recipient email' if how == 'email' else 'Mailing address'}: {to or '(none)'}",
            f"Sessions: {sessions}",
            f"Subtotal: {_rs(order.subtotal)}",
            f"Discount: {_rs(order.discount)} (bundle {d.get('discount_pct', 0)}%"
            f"{', coupon ' + d['coupon'] if d.get('coupon') else ''})",
            f"Total: {_rs(order.total)}",
            f"Coupon: {_coupon_text(order, body.coupon)}",
            f"Personal message: {message or '(none)'}", "",
            "Verify the attached receipt, then mark the order as paid.",
        ]),
        attachments=admin_attachments,
    ))
    stored = await _store_receipt(s, order, proof)
    await _send(s, "gift", *mails)
    await _mark_submitted(order, stored, body.coupon)
    return {"message": "Gift request sent.", "order_no": order.order_no}


@router.post("/bookings/request")
async def booking_request(request: Request, data: str = Form(...), receipt: UploadFile = File(...)):
    s: Settings = request.app.state.settings
    body: BookingRequestIn = _parse(BookingRequestIn, data)
    proof = await _read_receipt(receipt, s.receipt_max_bytes)
    order = await _pending_order(body.order_id, "booking")

    c, d = order.customer, order.details
    attachments = [proof]
    partner_rows = []
    if d.get("partner_verification_id"):
        v = await PartnerVerification.get_or_none(id=d["partner_verification_id"])
        partner_rows = [("Partner programme", f"{d.get('partner_name')} ({d.get('discount_pct')}% off)"),
                        ("Employee ID", d.get("employee_id")),
                        ("ID check", f"{v.status} (document attached)" if v else "record missing")]
        if v:
            attachments.append(Attachment(f"id-{v.file_name}", bytes(v.file_data), v.file_mime))
    rows = [
        ("Name", c.name), ("Email", c.email), ("Phone", c.phone), ("Age", body.age), ("Role", body.role),
        ("Concerns", ", ".join(body.concern)), ("Description", body.desc), ("Duration", body.duration),
        ("Distress (0-10)", body.distress), ("Immediate danger", body.danger),
        ("Suicidal thoughts", body.suicidal), ("Self-harm", body.harm), ("Medical emergency", body.medical),
        ("Current treatment", body.treatment), ("Preferred date", d.get("preferred_date")),
        ("Preferred time", d.get("preferred_time")), ("Notes", body.notes),
        *([] if partner_rows else [("Coupon", _coupon_text(order, body.coupon))]), *partner_rows,
        ("Subtotal", _rs(order.subtotal)), ("Discount", _rs(order.discount)), ("Total", _rs(order.total)),
    ]
    tag = f"{d['partner_name']} booking" if d.get("partner_name") else "Booking"
    admin = Mail(
        to=s.admin_email,
        reply_to=c.email,
        subject=f"{tag} #{order.order_no} from {c.name}: payment receipt attached",
        text="\n".join([
            f"Booking request #{order.order_no} was submitted with a payment receipt.", "",
            *[f"{label}: {value if value not in (None, '') else '(none)'}" for label, value in rows],
            "Session mode: Online via Google Meet",
            "Payment status: Not verified (receipt attached)",
            "Consent: Yes",
        ]),
        attachments=attachments,
    )
    customer = Mail(
        to=c.email,
        subject="We received your Panik session request",
        text="\n".join([
            f"Hello {c.name},", "",
            f"We received your session request (#{order.order_no}). Our team will review your preferred "
            "appointment time and contact you about next steps.", "",
            "Your appointment is not confirmed yet. It will be scheduled after your payment is verified.", "",
            "If you are in immediate danger or experiencing a medical emergency, contact local emergency services "
            "now. Do not wait for an email reply.",
        ]),
    )
    stored = await _store_receipt(s, order, proof)
    await _send(s, "booking", admin, customer)
    await _mark_submitted(order, stored, None if d.get("partner") else body.coupon)
    return {"message": "Booking request sent.", "order_no": order.order_no}

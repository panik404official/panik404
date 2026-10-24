import re
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from tortoise.exceptions import IntegrityError
from tortoise.transactions import in_transaction

from ..models import Customer, Event, Lead, Order, OrderItem, Payment, PartnerVerification, Product, Visitor
from ..partners import BOOKING_NOTICE_GRACE, MIN_BOOKING_NOTICE, PARTNERS, VERIFICATION_MAX_AGE
from ..schemas import BookingOrder, CustomerIn, GiftOrder, LeadIn, ProductOrder
from . import coupons as coupons_repo
from .tracking import Ctx, ensure_visitor_session

CENT = Decimal("0.01")
RUPEE = Decimal("1")
PKT = ZoneInfo("Asia/Karachi")
TIME_RE = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])\s*$")
GIFT_PRODUCT = "gift-session"
BOOKING_PRODUCT = "booking-consultation"


class OrderError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code, self.message = status_code, message


async def _products(ids: list[str], kind: str) -> dict[str, dict]:
    rows = await Product.filter(id__in=ids, kind=kind, active=True).values("id", "name", "unit_price")
    return {r["id"]: r for r in rows}


async def _price(body) -> tuple[list[dict], Decimal, Decimal, dict[str, Any]]:
    """Returns (lines, subtotal, discount, details). Prices ALWAYS come from the DB, never the client."""
    if isinstance(body, ProductOrder):
        merged: dict[str, int] = {}
        for it in body.items:
            merged[it.product_id] = merged.get(it.product_id, 0) + it.quantity
        found = await _products(list(merged), "product")
        missing = [p for p in merged if p not in found]
        if missing:
            raise OrderError(422, f"Unknown or unavailable product(s): {', '.join(missing)}")
        lines = [{"product_id": p, "name": found[p]["name"], "unit_price": found[p]["unit_price"], "quantity": q}
                 for p, q in merged.items()]
        return lines, sum((l["unit_price"] * l["quantity"] for l in lines), Decimal(0)), Decimal(0), {}

    if isinstance(body, GiftOrder):
        prod = (await _products([GIFT_PRODUCT], "gift")).get(GIFT_PRODUCT)
        if not prod:
            raise OrderError(503, "Gift sessions are currently unavailable")
        subtotal = prod["unit_price"] * body.quantity
        pct = min(50, (body.quantity - 1) * 10)  # same rule the storefront shows
        discount = (subtotal * pct / 100).quantize(CENT, ROUND_HALF_UP)
        details = {"recipient": body.recipient, "delivery": body.delivery, "discount_pct": pct,
                   "recipient_email": body.recipient_email, "address": body.address, "message": body.message}
        line = {"product_id": GIFT_PRODUCT, "name": prod["name"], "unit_price": prod["unit_price"],
                "quantity": body.quantity}
        return [line], subtotal, discount, details

    assert isinstance(body, BookingOrder)
    prod = (await _products([BOOKING_PRODUCT], "booking")).get(BOOKING_PRODUCT)
    if not prod:
        raise OrderError(503, "Bookings are currently unavailable")
    _check_notice(body)
    details = {"preferred_date": body.preferred_date.isoformat() if body.preferred_date else None,
               "preferred_time": body.preferred_time, "mode": "online"}
    if body.preferred_at:
        details["preferred_at"] = body.preferred_at.isoformat()
    discount = Decimal(0)
    if body.partner_verification_id:
        v = await _usable_verification(body.partner_verification_id)
        partner = PARTNERS[v.partner]
        discount = (prod["unit_price"] * partner.discount_pct / 100).quantize(RUPEE, ROUND_HALF_UP)
        details.update(partner=partner.slug, partner_name=partner.name, discount_pct=partner.discount_pct,
                       partner_verification_id=str(v.id), employee_id=v.employee_id)
    line = {"product_id": BOOKING_PRODUCT, "name": prod["name"], "unit_price": prod["unit_price"], "quantity": 1}
    return [line], prod["unit_price"], discount, details


def _parse_time(value: str | None) -> time | None:
    m = TIME_RE.match(value or "")
    if not m:
        return None
    h, mi, ap = int(m[1]), int(m[2]), m[3].upper()
    if not (1 <= h <= 12 and 0 <= mi <= 59):
        return None
    return time(h % 12 + (12 if ap == "PM" else 0), mi)


def _check_notice(body: BookingOrder) -> None:
    """Sessions must be requested at least 48 hours ahead. Uses the visitor's own offset when the browser sends
    preferred_at; otherwise the date and time are read as Pakistan time."""
    when = body.preferred_at
    if when is None and body.preferred_date:
        t = _parse_time(body.preferred_time)
        if body.preferred_time and t is None:
            raise OrderError(422, "Preferred time must look like 4:30 PM.")
        when = datetime.combine(body.preferred_date, t or time(23, 59), tzinfo=PKT)
    if when is None:
        return
    earliest = datetime.now(timezone.utc) + MIN_BOOKING_NOTICE
    if when < earliest - BOOKING_NOTICE_GRACE:
        local = earliest.astimezone(when.tzinfo or PKT)
        raise OrderError(422, "Sessions must be booked at least 48 hours ahead. Choose "
                              f"{local.strftime('%a %d %b, %I:%M %p').replace(' 0', ' ')} or later.")


async def _usable_verification(vid) -> PartnerVerification:
    v = await PartnerVerification.get_or_none(id=vid)
    if v is None or v.partner not in PARTNERS:
        raise OrderError(422, "Partner verification not found. Upload your details again.")
    if v.status == "rejected":
        raise OrderError(409, "This verification was not approved. Contact Panik for help.")
    if v.order_id:
        raise OrderError(409, "This verification was already used for a booking.")
    if datetime.now(timezone.utc) - v.created_at > VERIFICATION_MAX_AGE:
        raise OrderError(409, "This verification has expired. Upload your details again.")
    return v


async def _upsert_customer(c: CustomerIn) -> Customer:
    await Customer.bulk_create([Customer(email=str(c.email), name=c.name, phone=c.phone)], ignore_conflicts=True)
    cust = await Customer.get(email=str(c.email))
    if (c.name and cust.name != c.name) or (c.phone and cust.phone != c.phone):
        cust.name, cust.phone = c.name or cust.name, c.phone or cust.phone
        await cust.save(update_fields=["name", "phone", "updated_at"])
    return cust


async def create_order(body, ctx: Ctx, idem_key: str | None) -> tuple[Order, bool]:
    """Returns (order, created). Safe to retry with the same Idempotency-Key."""
    if idem_key and (existing := await Order.get_or_none(idempotency_key=idem_key)):
        return existing, False
    try:
        async with in_transaction() as conn:
            now = datetime.now(timezone.utc)
            await ensure_visitor_session(body.visitor_id, body.session_id, ctx, now)
            lines, subtotal, discount, details = await _price(body)
            coupon = None
            if coupons_repo.normalize(body.coupon):
                if details.get("partner"):
                    raise OrderError(422, "Coupons can't be combined with the partner price.")
                try:
                    coupon = await coupons_repo.validate(body.coupon, body.kind)
                except coupons_repo.CouponError as e:
                    raise OrderError(e.status_code, e.message) from None
                # The coupon comes off what's left after automatic discounts (e.g. the gift bundle discount).
                off = coupons_repo.discount_for(coupon, subtotal - discount)
                discount += off
                details.update(coupon=coupon.code, coupon_id=str(coupon.id), coupon_label=coupons_repo.label(coupon),
                               coupon_discount=str(off))
            total = max(subtotal - discount, Decimal(0))
            customer = await _upsert_customer(body.customer)
            # Stitch the anonymous browsing history to this customer
            await Visitor.filter(id=body.visitor_id).update(customer_id=customer.id)

            order_no = (await conn.execute_query_dict("SELECT nextval('order_no_seq') AS n"))[0]["n"]
            order = await Order.create(
                order_no=order_no, idempotency_key=idem_key, visitor_id=body.visitor_id,
                session_id=body.session_id, customer_id=customer.id, kind=body.kind,
                subtotal=subtotal, discount=discount, total=total, details=details,
            )
            await OrderItem.bulk_create([
                OrderItem(order_id=order.id, line_no=i, product_id=l["product_id"], name=l["name"],
                          unit_price=l["unit_price"], quantity=l["quantity"])
                for i, l in enumerate(lines, 1)])
            if coupon is not None:
                try:
                    await coupons_repo.claim(coupon, conn)
                except coupons_repo.CouponError as e:
                    raise OrderError(e.status_code, e.message) from None
            if vid := details.get("partner_verification_id"):
                claimed = await PartnerVerification.filter(id=vid, order_id__isnull=True).update(
                    order_id=order.id, used_at=now)
                if not claimed:  # another tab booked with it a moment ago
                    raise OrderError(409, "This verification was already used for a booking.")
            await Event.create(occurred_at=now, visitor_id=body.visitor_id, session_id=body.session_id,
                               type="order_created", path="/checkout",
                               props={"order_id": str(order.id), "order_no": order_no, "kind": body.kind,
                                      "total": str(total)})
            return order, True
    except IntegrityError:
        # concurrent duplicate request with the same Idempotency-Key
        if idem_key and (existing := await Order.get_or_none(idempotency_key=idem_key)):
            return existing, False
        raise


async def create_lead(body: LeadIn, ctx: Ctx) -> str:
    async with in_transaction():
        now = datetime.now(timezone.utc)
        await ensure_visitor_session(body.visitor_id, body.session_id, ctx, now)
        lead = await Lead.create(visitor_id=body.visitor_id, session_id=body.session_id, name=body.name,
                                 email=str(body.email), team_size=body.team_size, message=body.message)
        await Event.create(occurred_at=now, visitor_id=body.visitor_id, session_id=body.session_id,
                           type="lead_created", path="/corporate", props={})
    return str(lead.id)


_TRANSITIONS = {"pending": {"paid", "failed", "cancelled"}, "paid": {"refunded"},
                "failed": {"pending", "cancelled"}, "cancelled": set(), "refunded": set()}


async def set_status(order_id, status: str, provider: str | None, provider_ref: str | None) -> Order:
    async with in_transaction():
        order = await Order.filter(id=order_id).select_for_update().first()
        if order is None:
            raise OrderError(404, "Order not found")
        if status not in _TRANSITIONS[order.status]:
            raise OrderError(409, f"Cannot move order from {order.status} to {status}")
        now = datetime.now(timezone.utc)
        order.status = status
        if status == "paid":
            order.paid_at = order.paid_at or now
        await order.save(update_fields=["status", "paid_at", "updated_at"])
        if status == "cancelled":  # final; a failed order can still go back to pending, so it keeps its use
            await coupons_repo.release(order)
        if status in ("paid", "refunded"):
            await Payment.bulk_create(
                [Payment(order_id=order.id, provider=provider or "manual",
                         provider_ref=provider_ref or f"{order.order_no}:{status}",
                         amount=order.total, status=status)],
                ignore_conflicts=True)
        if status == "paid" and order.visitor_id and order.session_id:
            await Event.create(occurred_at=now, visitor_id=order.visitor_id, session_id=order.session_id,
                               type="order_paid", props={"order_id": str(order.id), "total": str(order.total)})
    return order

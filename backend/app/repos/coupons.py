"""Coupon codes: admins create them in the panel, customers apply them at checkout.

The server is the only judge: the storefront's "Apply" is a preview, and the order is priced again here when it
is created (prices and discounts never come from the browser). A use is taken when the order is placed, inside the
same transaction, so a limited code can't be over-used by two people at once; cancelling the order gives it back.
"""
import re
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from tortoise import connections
from tortoise.exceptions import IntegrityError

from ..models import Coupon, Order

RUPEE = Decimal("1")
KINDS = ("booking", "gift", "product")
KIND_WORDS = {"booking": "session bookings", "gift": "gift vouchers", "product": "journals"}
CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,39}$")


class CouponError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code, self.message = status_code, message


def normalize(code: str | None) -> str:
    return re.sub(r"\s+", "", code or "").upper()


def label(c: Coupon) -> str:
    v = Decimal(c.value)
    return f"{v.normalize():f}% off" if c.discount_type == "percent" else f"Rs {int(v):,} off"


def discount_for(c: Coupon, base: Decimal) -> Decimal:
    """Rupees off `base` (never more than base, never negative)."""
    base = max(Decimal(base), Decimal(0))
    v = Decimal(c.value)
    off = (base * v / 100) if c.discount_type == "percent" else v
    return min(base, off.quantize(RUPEE, ROUND_HALF_UP))


async def validate(code: str, kind: str) -> Coupon:
    """The coupon, if it can be used for this kind of order right now. Same message for "doesn't exist" and
    "switched off", so codes can't be probed."""
    c = await Coupon.get_or_none(code=normalize(code))
    now = datetime.now(timezone.utc)
    if c is None or not c.active or (c.starts_at and c.starts_at > now):
        raise CouponError(422, "This coupon code isn't valid.")
    if c.expires_at and c.expires_at <= now:
        raise CouponError(422, "This coupon code has expired.")
    if kind not in (c.applies_to or []):
        words = ", ".join(KIND_WORDS[k] for k in KINDS if k in (c.applies_to or [])) or "nothing at the moment"
        raise CouponError(422, f"This coupon can only be used for {words}.")
    if c.max_uses is not None and c.uses >= c.max_uses:
        raise CouponError(422, "This coupon code has been used up.")
    return c


async def claim(c: Coupon, conn) -> None:
    """Takes one use, atomically. Run inside the order's transaction."""
    n, _ = await conn.execute_query(
        "UPDATE coupons SET uses = uses + 1, updated_at = now() WHERE id = $1 AND active "
        "AND (max_uses IS NULL OR uses < max_uses)", [str(c.id)])
    if not n:
        raise CouponError(422, "This coupon code has just been used up.")


async def release(order: Order, conn=None) -> None:
    """Gives the use back when an order is cancelled (once per order)."""
    d = order.details or {}
    if not d.get("coupon_id") or d.get("coupon_released"):
        return
    db = conn or connections.get("default")
    await db.execute_query("UPDATE coupons SET uses = GREATEST(uses - 1, 0), updated_at = now() WHERE id = $1",
                           [d["coupon_id"]])
    order.details = {**d, "coupon_released": True}
    await order.save(update_fields=["details", "updated_at"], using_db=conn)


def public_view(c: Coupon) -> dict[str, Any]:
    return {"code": c.code, "discount_type": c.discount_type, "value": c.value, "label": label(c)}


# ---- admin -----------------------------------------------------------------------------------------------
def admin_row(c: Coupon, stats: dict | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    state = ("off" if not c.active else "expired" if c.expires_at and c.expires_at <= now
             else "scheduled" if c.starts_at and c.starts_at > now
             else "used_up" if c.max_uses is not None and c.uses >= c.max_uses else "active")
    st = stats or {}
    return {"id": str(c.id), "code": c.code, "discount_type": c.discount_type, "value": c.value, "label": label(c),
            "applies_to": c.applies_to, "active": c.active, "state": state, "starts_at": c.starts_at,
            "expires_at": c.expires_at, "max_uses": c.max_uses, "uses": c.uses, "note": c.note,
            "paid_orders": st.get("paid_orders", 0), "discount_given": st.get("discount_given", 0),
            "created_at": c.created_at, "updated_at": c.updated_at}


async def _stats() -> dict[str, dict]:
    rows = await connections.get("default").execute_query_dict(
        """SELECT details->>'coupon_id' AS id, count(*) AS paid_orders,
                  COALESCE(sum((details->>'coupon_discount')::numeric), 0) AS discount_given
           FROM orders WHERE status = 'paid' AND details ? 'coupon_id' GROUP BY 1""")
    return {r["id"]: r for r in rows}


async def list_coupons() -> list[dict]:
    stats = await _stats()
    return [admin_row(c, stats.get(str(c.id))) for c in await Coupon.all().order_by("-created_at")]


def _check(discount_type: str, value: Decimal, applies_to: list[str], starts_at, expires_at) -> None:
    if discount_type == "percent" and not (0 < value <= 100):
        raise CouponError(422, "A percentage must be between 1 and 100.")
    if discount_type == "amount" and value <= 0:
        raise CouponError(422, "The amount off must be more than 0.")
    if not applies_to:
        raise CouponError(422, "Choose at least one thing the coupon works for.")
    if starts_at and expires_at and expires_at <= starts_at:
        raise CouponError(422, "The end date must be after the start date.")


async def create(body, by: UUID | None) -> dict:
    code = normalize(body.code)
    if not CODE_RE.match(code):
        raise CouponError(422, "Use 3 to 40 letters, numbers, - or _ for the code.")
    kinds = [k for k in KINDS if k in body.applies_to]
    _check(body.discount_type, body.value, kinds, body.starts_at, body.expires_at)
    try:
        c = await Coupon.create(code=code, discount_type=body.discount_type, value=body.value, applies_to=kinds,
                                active=body.active, starts_at=body.starts_at, expires_at=body.expires_at,
                                max_uses=body.max_uses, note=(body.note or "").strip() or None, created_by_id=by)
    except IntegrityError:
        raise CouponError(409, f"There is already a coupon called {code}.") from None
    return admin_row(c)


async def update(coupon_id: UUID, body) -> dict:
    c = await Coupon.get_or_none(id=coupon_id)
    if c is None:
        raise CouponError(404, "Coupon not found")
    changes = body.model_dump(exclude_unset=True)
    if "applies_to" in changes:
        changes["applies_to"] = [k for k in KINDS if k in changes["applies_to"]]
    if "note" in changes:
        changes["note"] = (changes["note"] or "").strip() or None
    for k, v in changes.items():
        setattr(c, k, v)
    _check(c.discount_type, Decimal(c.value), c.applies_to, c.starts_at, c.expires_at)
    if c.max_uses is not None and c.max_uses < 1:
        raise CouponError(422, "The limit must be at least 1, or empty for no limit.")
    await c.save()
    return admin_row(c, (await _stats()).get(str(c.id)))


async def delete(coupon_id: UUID) -> None:
    c = await Coupon.get_or_none(id=coupon_id)
    if c is None:
        raise CouponError(404, "Coupon not found")
    used = await connections.get("default").execute_query_dict(
        "SELECT 1 FROM orders WHERE details->>'coupon_id' = $1 LIMIT 1", [str(c.id)])
    if c.uses or used:
        raise CouponError(409, "This coupon was used on orders, so it can't be deleted. Switch it off instead.")
    await c.delete()

"""Admin read/write for partner verifications. The ID document bytes are only returned by the file endpoint."""
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from tortoise.expressions import Q

from ..models import Order, PartnerVerification
from ..partners import PARTNERS

LIST_FIELDS = ("id", "partner", "status", "employee_id", "file_name",
               "file_mime", "file_size", "order_id", "used_at", "admin_note", "reviewed_at", "created_at",
               "updated_at", "visitor_id")


async def _with_orders(rows: list[dict]) -> list[dict]:
    ids = [r["order_id"] for r in rows if r["order_id"]]
    orders = {o["id"]: o for o in await Order.filter(id__in=ids).values(
        "id", "order_no", "status", "total", "subtotal", "discount", "customer_id", "details", "customer__name",
        "customer__email", "customer__phone")} if ids else {}
    for r in rows:
        o = orders.get(r["order_id"])
        r["partner_name"] = PARTNERS[r["partner"]].name if r["partner"] in PARTNERS else r["partner"]
        # who it is comes from the booking; before booking only the employee ID is known
        r["name"] = o["customer__name"] if o else None
        r["email"] = o["customer__email"] if o else None
        r["phone"] = o["customer__phone"] if o else None
        r["order"] = None if o is None else {
            "id": o["id"], "order_no": o["order_no"], "status": o["status"], "total": o["total"],
            "subtotal": o["subtotal"], "discount": o["discount"], "customer_id": o["customer_id"],
            "preferred_date": (o["details"] or {}).get("preferred_date"),
            "preferred_time": (o["details"] or {}).get("preferred_time"),
            "request_submitted_at": (o["details"] or {}).get("request_submitted_at"),
        }
    return rows


async def list_verifications(partner: str | None, status: str | None, booked: bool | None, q: str | None,
                             limit: int) -> list[dict]:
    qs = PartnerVerification.all()
    if partner:
        qs = qs.filter(partner=partner)
    if status:
        qs = qs.filter(status=status)
    if booked is not None:
        qs = qs.filter(order_id__isnull=not booked)
    if q and q.strip():
        t = q.strip()
        qs = qs.filter(Q(employee_id__icontains=t) | Q(order__customer__name__icontains=t)
                       | Q(order__customer__email__icontains=t) | Q(order__customer__phone__icontains=t))
    rows = await qs.order_by("-created_at").limit(limit).values(*LIST_FIELDS)
    return await _with_orders(rows)


async def detail(vid: UUID) -> dict | None:
    rows = await PartnerVerification.filter(id=vid).values(*LIST_FIELDS)
    return (await _with_orders(rows))[0] if rows else None


async def file(vid: UUID) -> PartnerVerification | None:
    return await PartnerVerification.get_or_none(id=vid)


async def review(vid: UUID, status: str | None, note: str | None, note_set: bool) -> dict | None:
    v = await PartnerVerification.get_or_none(id=vid)
    if v is None:
        return None
    fields: list[str] = ["updated_at"]
    if status and status != v.status:
        v.status, v.reviewed_at = status, datetime.now(timezone.utc) if status != "pending" else None
        fields += ["status", "reviewed_at"]
    if note_set:
        v.admin_note = (note or "").strip() or None
        fields.append("admin_note")
    await v.save(update_fields=fields)
    return await detail(vid)


async def counts() -> dict[str, Any]:
    pending = await PartnerVerification.filter(status="pending").count()
    return {"pending": pending}

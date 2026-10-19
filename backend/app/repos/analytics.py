from datetime import datetime

from tortoise.expressions import Q
from tortoise.functions import Count, Sum

from ..models import Customer, Event, Order, Session, Visitor


async def funnel(start: datetime, end: datetime) -> dict:
    ev = (await Event.filter(occurred_at__gte=start, occurred_at__lt=end,
                             type__in=["page_view", "product_view", "add_to_cart", "begin_checkout"])
          .annotate(
              visitors=Count("visitor_id", distinct=True, _filter=Q(type="page_view")),
              product_viewers=Count("visitor_id", distinct=True, _filter=Q(type="product_view")),
              added_to_cart=Count("visitor_id", distinct=True, _filter=Q(type="add_to_cart")),
              began_checkout=Count("visitor_id", distinct=True, _filter=Q(type="begin_checkout")))
          .values("visitors", "product_viewers", "added_to_cart", "began_checkout"))[0]
    od = (await Order.filter(created_at__gte=start, created_at__lt=end)
          .annotate(
              ordered=Count("visitor_id", distinct=True),
              paid=Count("visitor_id", distinct=True, _filter=Q(status="paid")),
              paid_orders=Count("id", _filter=Q(status="paid")),
              revenue=Sum("total", _filter=Q(status="paid")))
          .values("ordered", "paid", "paid_orders", "revenue"))[0]
    stages = [("visitors", ev["visitors"]), ("product_viewers", ev["product_viewers"]),
              ("added_to_cart", ev["added_to_cart"]), ("began_checkout", ev["began_checkout"]),
              ("ordered", od["ordered"]), ("paid", od["paid"])]
    base = stages[0][1] or 0
    return {
        "range": {"start": start, "end": end},
        "stages": [{"stage": n, "visitors": c, "rate_vs_visitors": round(c / base, 4) if base else None}
                   for n, c in stages],
        "paid_orders": od["paid_orders"],
        "revenue": od["revenue"] or 0,
    }


async def sources(start: datetime, end: datetime) -> list[dict]:
    seen = await (Visitor.filter(first_seen_at__gte=start, first_seen_at__lt=end)
                  .annotate(n=Count("id")).group_by("first_source").values("first_source", "n"))
    bought = await (Order.filter(status="paid", visitor__first_seen_at__gte=start, visitor__first_seen_at__lt=end)
                    .annotate(buyers=Count("visitor_id", distinct=True), revenue=Sum("total"))
                    .group_by("visitor__first_source").values("visitor__first_source", "buyers", "revenue"))
    by_src = {b["visitor__first_source"]: b for b in bought}
    rows = [{"source": r["first_source"], "visitors": r["n"],
             "buyers": by_src.get(r["first_source"], {}).get("buyers", 0),
             "revenue": by_src.get(r["first_source"], {}).get("revenue") or 0} for r in seen]
    return sorted(rows, key=lambda r: r["visitors"], reverse=True)[:50]


async def journey(visitor_id, limit: int = 1000) -> dict | None:
    rows = await Visitor.filter(id=visitor_id).values()
    if not rows:
        return None
    visitor = rows[0]
    if visitor["customer_id"]:
        cust = await Customer.get_or_none(id=visitor["customer_id"])
        visitor["customer_email"], visitor["customer_name"] = (cust.email, cust.name) if cust else (None, None)
    sessions = await Session.filter(visitor_id=visitor_id).order_by("started_at").values()
    latest = await (Event.filter(visitor_id=visitor_id).order_by("-occurred_at", "-id").limit(limit)
                    .values("occurred_at", "session_id", "type", "path", "props"))
    orders = await (Order.filter(visitor_id=visitor_id).order_by("created_at")
                    .values("id", "order_no", "kind", "status", "total", "currency", "created_at", "paid_at"))
    return {"visitor": visitor, "sessions": sessions, "events": latest[::-1], "orders": orders}


async def list_orders(status: str | None, before: datetime | None, limit: int) -> list[dict]:
    qs = Order.all()
    if status:
        qs = qs.filter(status=status)
    if before:
        qs = qs.filter(created_at__lt=before)
    return await (qs.order_by("-created_at").limit(limit)
                  .values("id", "order_no", "kind", "status", "total", "currency", "created_at", "paid_at",
                          "visitor_id", email="customer__email", name="customer__name"))

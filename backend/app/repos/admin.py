"""Read models for the admin panel: everything the database knows about each customer.

Aggregated lists use parameterised SQL (one round-trip, no N+1); detail views use the ORM.
Note: booking screening answers are never stored (they are only emailed), so they cannot appear here.
"""
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from tortoise import connections
from tortoise.expressions import Q

from ..models import ContactMessage, Customer, Event, Lead, Order, Payment, Product, Session, Visitor

CUSTOMER_SORTS = {
    "recent": "c.created_at DESC",
    "spent": "spent DESC NULLS LAST, c.created_at DESC",
    "orders": "orders DESC, c.created_at DESC",
    "last_seen": "last_seen_at DESC NULLS LAST",
    "name": "lower(c.name) ASC NULLS LAST",
}


def _like(q: str | None) -> str | None:
    if not q or not q.strip():
        return None
    esc = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{esc}%"


async def _sql(sql: str, *params) -> list[dict]:
    return await connections.get("default").execute_query_dict(sql, list(params))


# ---- overview ----------------------------------------------------------------------------------------
async def overview() -> dict:
    now = datetime.now(timezone.utc)
    day, week, month = now - timedelta(days=1), now - timedelta(days=7), now - timedelta(days=30)
    totals = (await _sql(
        """SELECT
             (SELECT count(*) FROM customers)                                         AS customers,
             (SELECT count(*) FROM customers WHERE created_at >= $1)                  AS customers_7d,
             (SELECT count(*) FROM visitors)                                          AS visitors,
             (SELECT count(*) FROM visitors WHERE last_seen_at >= $2)                 AS visitors_24h,
             (SELECT count(*) FROM orders)                                            AS orders,
             (SELECT count(*) FROM orders WHERE status = 'pending')                   AS pending_orders,
             (SELECT coalesce(sum(total), 0) FROM orders WHERE status = 'paid')       AS revenue,
             (SELECT coalesce(sum(total), 0) FROM orders
                WHERE status = 'paid' AND paid_at >= $3)                              AS revenue_30d,
             (SELECT count(*) FROM leads)                                             AS leads""",
        week, day, month))[0]
    daily = await _sql(
        """SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Karachi')::date AS day,
                  count(*) AS orders,
                  coalesce(sum(total) FILTER (WHERE status = 'paid'), 0) AS revenue
           FROM orders WHERE created_at >= $1 GROUP BY 1 ORDER BY 1""", month)
    by_kind = await _sql(
        """SELECT kind, count(*) AS orders, coalesce(sum(total) FILTER (WHERE status = 'paid'), 0) AS revenue
           FROM orders GROUP BY kind ORDER BY orders DESC""")
    pending = await (Order.filter(status="pending").order_by("-created_at").limit(8)
                     .values("id", "order_no", "kind", "total", "currency", "created_at", "customer_id",
                             email="customer__email", name="customer__name"))
    return {"totals": totals, "daily": daily, "by_kind": by_kind, "pending": pending}


# ---- customers -----------------------------------------------------------------------------------------
async def list_customers(q: str | None, sort: str, limit: int, offset: int) -> dict:
    like = _like(q)
    order_by = CUSTOMER_SORTS.get(sort, CUSTOMER_SORTS["recent"])
    where = "WHERE ($1::text IS NULL OR c.email ILIKE $1 OR c.name ILIKE $1 OR c.phone ILIKE $1)"
    rows = await _sql(
        f"""SELECT c.id, c.email, c.name, c.phone, c.created_at,
                   coalesce(o.orders, 0) AS orders, coalesce(o.paid_orders, 0) AS paid_orders,
                   coalesce(o.spent, 0) AS spent, o.last_order_at,
                   coalesce(v.devices, 0) AS devices, v.last_seen_at, v.first_source
            FROM customers c
            LEFT JOIN LATERAL (
                SELECT count(*) AS orders, count(*) FILTER (WHERE status = 'paid') AS paid_orders,
                       sum(total) FILTER (WHERE status = 'paid') AS spent, max(created_at) AS last_order_at
                FROM orders WHERE customer_id = c.id) o ON true
            LEFT JOIN LATERAL (
                SELECT count(*) AS devices, max(last_seen_at) AS last_seen_at,
                       (array_agg(first_source ORDER BY first_seen_at))[1] AS first_source
                FROM visitors WHERE customer_id = c.id) v ON true
            {where}
            ORDER BY {order_by}
            LIMIT $2 OFFSET $3""", like, limit, offset)
    total = (await _sql(f"SELECT count(*) AS n FROM customers c {where}", like))[0]["n"]
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


def _order_dict(o: Order) -> dict:
    return {
        "id": o.id, "order_no": o.order_no, "kind": o.kind, "status": o.status, "currency": o.currency,
        "subtotal": o.subtotal, "discount": o.discount, "total": o.total, "details": o.details,
        "created_at": o.created_at, "paid_at": o.paid_at, "updated_at": o.updated_at,
        "visitor_id": o.visitor_id, "session_id": o.session_id, "idempotency_key": o.idempotency_key,
        "items": [{"line_no": i.line_no, "product_id": i.product_id, "name": i.name, "unit_price": i.unit_price,
                   "quantity": i.quantity, "line_total": i.unit_price * i.quantity}
                  for i in sorted(o.items, key=lambda i: i.line_no)],
        "payments": [{"id": p.id, "provider": p.provider, "provider_ref": p.provider_ref, "amount": p.amount,
                      "status": p.status, "payload": p.payload, "created_at": p.created_at}
                     for p in sorted(o.payments, key=lambda p: p.created_at)],
    }


async def customer_profile(customer_id: UUID, event_limit: int) -> dict | None:
    cust = await Customer.filter(id=customer_id).values()
    if not cust:
        return None
    customer = cust[0]
    orders = await Order.filter(customer_id=customer_id).order_by("-created_at").prefetch_related("items", "payments")
    visitors = await Visitor.filter(customer_id=customer_id).order_by("first_seen_at").values()
    # Orders may have been placed from a browser that was later re-linked; include those visitors too.
    vids = list({v["id"] for v in visitors} | {o.visitor_id for o in orders if o.visitor_id})
    if len(vids) > len(visitors):
        visitors = await Visitor.filter(id__in=vids).order_by("first_seen_at").values()

    sessions = await Session.filter(visitor_id__in=vids).order_by("-started_at").values() if vids else []
    events = (await Event.filter(visitor_id__in=vids).order_by("-occurred_at", "-id").limit(event_limit)
              .values("id", "occurred_at", "visitor_id", "session_id", "type", "path", "props")) if vids else []
    event_total = await Event.filter(visitor_id__in=vids).count() if vids else 0
    leads = await (Lead.filter(Q(email=customer["email"]) | Q(visitor_id__in=vids) if vids
                               else Q(email=customer["email"])).order_by("-created_at").values())

    per_session = Counter(e["session_id"] for e in events)
    for s in sessions:
        s["events_loaded"] = per_session.get(s["id"], 0)

    paid = [o for o in orders if o.status == "paid"]
    bought: dict[str, dict[str, Any]] = {}
    for o in paid:
        for i in o.items:
            b = bought.setdefault(i.product_id, {"product_id": i.product_id, "name": i.name, "quantity": 0,
                                                 "spent": Decimal(0)})
            b["quantity"] += i.quantity
            b["spent"] += i.unit_price * i.quantity
    viewed = Counter(e["props"].get("product_id") for e in events
                     if e["type"] == "product_view" and isinstance(e["props"], dict) and e["props"].get("product_id"))
    first_seen = min((v["first_seen_at"] for v in visitors), default=None)
    first_order = min((o.created_at for o in orders), default=None)

    stats = {
        "orders": len(orders),
        "paid_orders": len(paid),
        "lifetime_value": sum((o.total for o in paid), Decimal(0)),
        "pending_value": sum((o.total for o in orders if o.status == "pending"), Decimal(0)),
        "refunded": sum((o.total for o in orders if o.status == "refunded"), Decimal(0)),
        "average_order": (sum((o.total for o in paid), Decimal(0)) / len(paid)).quantize(Decimal("0.01")) if paid else None,
        "devices": len(visitors),
        "sessions": len(sessions),
        "events": event_total,
        "first_seen_at": first_seen,
        "last_seen_at": max((v["last_seen_at"] for v in visitors), default=None),
        "first_order_at": first_order,
        "days_to_first_order": (first_order - first_seen).days if first_seen and first_order else None,
        "acquisition_source": visitors[0]["first_source"] if visitors else None,
        "event_types": dict(Counter(e["type"] for e in events).most_common()),
        "top_pages": [{"path": p, "views": n} for p, n in
                      Counter(e["path"] for e in events if e["type"] == "page_view" and e["path"]).most_common(10)],
        "products_viewed": [{"product_id": p, "views": n} for p, n in viewed.most_common(10)],
        "products_bought": sorted(bought.values(), key=lambda b: b["spent"], reverse=True),
    }
    return {"customer": customer, "stats": stats, "orders": [_order_dict(o) for o in orders],
            "visitors": visitors, "sessions": sessions, "events": events, "leads": leads}


# ---- orders ------------------------------------------------------------------------------------------
async def order_detail(order_id: UUID) -> dict | None:
    o = await Order.get_or_none(id=order_id).prefetch_related("items", "payments", "customer")
    if o is None:
        return None
    data = _order_dict(o)
    c = o.customer
    data["customer"] = {"id": c.id, "email": c.email, "name": c.name, "phone": c.phone, "created_at": c.created_at}
    data["visitor"] = (await Visitor.filter(id=o.visitor_id).values() or [None])[0] if o.visitor_id else None
    data["session"] = (await Session.filter(id=o.session_id).values() or [None])[0] if o.session_id else None
    # The browsing that led to this order: everything in the checkout session.
    data["session_events"] = (await Event.filter(session_id=o.session_id, visitor_id=o.visitor_id)
                              .order_by("occurred_at", "id").limit(500)
                              .values("id", "occurred_at", "session_id", "type", "path", "props")) if o.session_id else []
    return data


async def search_orders(status: str | None, kind: str | None, q: str | None, before: datetime | None,
                        limit: int) -> list[dict]:
    qs = Order.all()
    if status:
        qs = qs.filter(status=status)
    if kind:
        qs = qs.filter(kind=kind)
    if before:
        qs = qs.filter(created_at__lt=before)
    if q and q.strip():
        term = q.strip().lstrip("#")
        cond = Q(customer__email__icontains=term) | Q(customer__name__icontains=term) | Q(customer__phone__icontains=term)
        if term.isdigit():
            cond |= Q(order_no=int(term))
        qs = qs.filter(cond)
    return await (qs.order_by("-created_at").limit(limit)
                  .values("id", "order_no", "kind", "status", "total", "currency", "created_at", "paid_at",
                          "visitor_id", "customer_id", email="customer__email", name="customer__name",
                          phone="customer__phone"))


# ---- visitors, leads, live activity -------------------------------------------------------------------
async def list_visitors(identified: bool | None, q: str | None, before: datetime | None, limit: int) -> list[dict]:
    like = _like(q)
    rows = await _sql(
        """SELECT v.id, v.first_seen_at, v.last_seen_at, v.first_source, v.first_landing_path, v.first_referrer_host,
                  v.first_utm_campaign, v.country, v.user_agent, v.customer_id,
                  c.email AS customer_email, c.name AS customer_name,
                  (SELECT count(*) FROM sessions s WHERE s.visitor_id = v.id) AS sessions
           FROM visitors v LEFT JOIN customers c ON c.id = v.customer_id
           WHERE ($1::boolean IS NULL OR (v.customer_id IS NOT NULL) = $1)
             AND ($2::text IS NULL OR v.first_source ILIKE $2 OR v.first_landing_path ILIKE $2
                  OR v.first_utm_campaign ILIKE $2 OR c.email ILIKE $2 OR c.name ILIKE $2)
             AND ($3::timestamptz IS NULL OR v.last_seen_at < $3)
           ORDER BY v.last_seen_at DESC
           LIMIT $4""", identified, like, before, limit)
    return rows


async def list_leads(q: str | None, before: datetime | None, limit: int) -> list[dict]:
    qs = Lead.all()
    if before:
        qs = qs.filter(created_at__lt=before)
    if q and q.strip():
        t = q.strip()
        qs = qs.filter(Q(email__icontains=t) | Q(name__icontains=t) | Q(message__icontains=t))
    rows = await qs.order_by("-created_at").limit(limit).values()
    emails = list({r["email"] for r in rows})
    ids = dict(await Customer.filter(email__in=emails).values_list("email", "id")) if emails else {}
    for r in rows:
        r["customer_id"] = ids.get(r["email"])
    return rows


async def list_contact_messages(q: str | None, before: datetime | None, limit: int) -> list[dict]:
    qs = ContactMessage.all()
    if before:
        qs = qs.filter(created_at__lt=before)
    if q and q.strip():
        t = q.strip()
        qs = qs.filter(Q(email__icontains=t) | Q(name__icontains=t) | Q(message__icontains=t) | Q(topic__icontains=t))
    rows = await qs.order_by("-created_at").limit(limit).values()
    emails = list({r["email"] for r in rows})
    ids = dict(await Customer.filter(email__in=emails).values_list("email", "id")) if emails else {}
    for r in rows:
        r["customer_id"] = ids.get(r["email"])
    return rows


async def live_events(type_: str | None, before: datetime | None, limit: int) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=31)  # keeps the scan to recent partitions
    qs = Event.filter(occurred_at__gte=since)
    if type_:
        qs = qs.filter(type=type_)
    if before:
        qs = qs.filter(occurred_at__lt=before)
    rows = await (qs.order_by("-occurred_at", "-id").limit(limit)
                  .values("id", "occurred_at", "visitor_id", "session_id", "type", "path", "props"))
    vids = list({r["visitor_id"] for r in rows})
    who = {}
    if vids:
        for v in await Visitor.filter(id__in=vids, customer_id__not_isnull=True).values(
                "id", "customer_id", email="customer__email", name="customer__name"):
            who[v["id"]] = v
    for r in rows:
        w = who.get(r["visitor_id"])
        r["customer_id"], r["customer_email"], r["customer_name"] = (
            (w["customer_id"], w["email"], w["name"]) if w else (None, None, None))
    return rows


async def products() -> list[dict]:
    rows = await Product.all().order_by("kind", "name").values()
    sold = {r["product_id"]: r for r in await _sql(
        """SELECT i.product_id, sum(i.quantity) AS units, sum(i.quantity * i.unit_price) AS revenue
           FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'paid'
           GROUP BY i.product_id""")}
    for r in rows:
        s = sold.get(r["id"], {})
        r["units_sold"], r["revenue"] = s.get("units", 0), s.get("revenue", 0)
    return rows


async def payments(limit: int) -> list[dict]:
    return await (Payment.all().order_by("-created_at").limit(limit)
                  .values("id", "provider", "provider_ref", "amount", "status", "created_at", "order_id",
                          order_no="order__order_no", email="order__customer__email",
                          customer_id="order__customer_id"))

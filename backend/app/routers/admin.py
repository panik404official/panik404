from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from ..repos import admin as admin_repo, analytics, consent as consent_repo, orders as orders_repo
from ..schemas import ConsentCreate, OrderOut, StatusUpdate
from ..security import require_admin

router = APIRouter(prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def date_range(start: datetime | None = None, end: datetime | None = None) -> tuple[datetime, datetime]:
    end = end or datetime.now(timezone.utc)
    start = start or end - timedelta(days=30)
    if start >= end:
        raise HTTPException(422, "start must be before end")
    if end - start > timedelta(days=366):
        raise HTTPException(422, "range too large (max 366 days)")
    return start, end


@router.get("/orders")
async def list_orders(
    status: Literal["pending", "paid", "failed", "cancelled", "refunded"] | None = None,
    kind: Literal["product", "gift", "booking"] | None = None,
    q: str | None = Query(None, max_length=200, description="email, name, phone or order number"),
    before: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    rows = await admin_repo.search_orders(status, kind, q, before, limit)
    return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}


@router.get("/orders/{order_id}")
async def order_detail(order_id: UUID):
    data = await admin_repo.order_detail(order_id)
    if data is None:
        raise HTTPException(404, "Order not found")
    return data


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
async def update_status(order_id: UUID, body: StatusUpdate):
    try:
        return await orders_repo.set_status(order_id, body.status, body.provider, body.provider_ref)
    except orders_repo.OrderError as e:
        raise HTTPException(e.status_code, e.message) from e


@router.get("/visitors/{visitor_id}/journey")
async def visitor_journey(visitor_id: UUID, limit: int = Query(1000, ge=1, le=5000)):
    data = await analytics.journey(visitor_id, limit)
    if data is None:
        raise HTTPException(404, "Visitor not found")
    return data


@router.get("/analytics/funnel")
async def funnel(rng: tuple[datetime, datetime] = Depends(date_range)):
    return await analytics.funnel(*rng)


@router.get("/analytics/sources")
async def sources(rng: tuple[datetime, datetime] = Depends(date_range)):
    return {"items": await analytics.sources(*rng)}


# ---- admin panel ---------------------------------------------------------------------------------------
@router.get("/overview")
async def overview():
    return await admin_repo.overview()


@router.get("/customers")
async def list_customers(
    q: str | None = Query(None, max_length=200, description="email, name or phone"),
    sort: Literal["recent", "spent", "orders", "last_seen", "name"] = "recent",
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    return await admin_repo.list_customers(q, sort, limit, offset)


@router.get("/customers/{customer_id}")
async def customer_profile(customer_id: UUID, event_limit: int = Query(2000, ge=1, le=10000)):
    data = await admin_repo.customer_profile(customer_id, event_limit)
    if data is None:
        raise HTTPException(404, "Customer not found")
    return data


@router.get("/visitors")
async def list_visitors(
    identified: bool | None = None,
    q: str | None = Query(None, max_length=200),
    before: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    rows = await admin_repo.list_visitors(identified, q, before, limit)
    return {"items": rows, "next_before": rows[-1]["last_seen_at"] if len(rows) == limit else None}


@router.get("/leads")
async def list_leads(q: str | None = Query(None, max_length=200), before: datetime | None = None,
                     limit: int = Query(50, ge=1, le=200)):
    rows = await admin_repo.list_leads(q, before, limit)
    return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}


@router.get("/events")
async def live_events(type: str | None = Query(None, max_length=32), before: datetime | None = None,
                      limit: int = Query(100, ge=1, le=500)):
    rows = await admin_repo.live_events(type, before, limit)
    return {"items": rows, "next_before": rows[-1]["occurred_at"] if len(rows) == limit else None}


@router.get("/products")
async def products():
    return {"items": await admin_repo.products()}


@router.get("/payments")
async def payments(limit: int = Query(100, ge=1, le=500)):
    return {"items": await admin_repo.payments(limit)}


@router.get("/contact-messages")
async def contact_messages(q: str | None = Query(None, max_length=200), before: datetime | None = None,
                           limit: int = Query(50, ge=1, le=200)):
    rows = await admin_repo.list_contact_messages(q, before, limit)
    return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}


# ---- consent forms -------------------------------------------------------------------------------------
@router.get("/consent-forms")
async def list_consent_forms(state: Literal["open", "completed", "expired", "revoked"] | None = None,
                             q: str | None = Query(None, max_length=200), limit: int = Query(100, ge=1, le=500)):
    return {"items": await consent_repo.list_forms(state, q, limit)}


@router.post("/consent-forms", status_code=201)
async def create_consent_form(body: ConsentCreate):
    return consent_repo.admin_row(await consent_repo.create(body), full=True)


@router.get("/consent-forms/{form_id}")
async def consent_form_detail(form_id: UUID):
    form = await consent_repo.get(form_id)
    if form is None:
        raise HTTPException(404, "Consent form not found")
    return consent_repo.admin_row(form, full=True)


@router.post("/consent-forms/{form_id}/revoke")
async def revoke_consent_form(form_id: UUID):
    """Closes the link for good: it stops opening for everyone. The saved answers stay in the database."""
    try:
        return consent_repo.admin_row(await consent_repo.revoke(form_id), full=True)
    except consent_repo.ConsentError as e:
        raise HTTPException(e.status_code, e.message) from e

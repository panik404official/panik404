from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from ..repos import analytics, orders as orders_repo
from ..schemas import OrderOut, StatusUpdate
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
    before: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    rows = await analytics.list_orders(status, before, limit)
    return {"items": rows, "next_before": rows[-1]["created_at"] if len(rows) == limit else None}


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

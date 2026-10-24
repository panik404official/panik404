from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response

from ..context import build_ctx
from ..repos import coupons as coupons_repo, orders as repo
from ..schemas import CouponCheck, LeadIn, OrderIn, OrderOut
from ..security import limit

router = APIRouter(prefix="/v1", tags=["checkout"], dependencies=[Depends(limit("orders"))])


@router.post("/orders", response_model=OrderOut, status_code=201)
async def create_order(
    body: OrderIn,
    request: Request,
    response: Response,
    idempotency_key: str | None = Header(None, max_length=100),
):
    """Create an order. Totals are computed server-side. Send an Idempotency-Key header to make retries safe."""
    ctx = build_ctx(request, body.context, fallback_path="/checkout")
    try:
        order, created = await repo.create_order(body, ctx, idempotency_key)
    except repo.OrderError as e:
        raise HTTPException(e.status_code, e.message) from e
    if not created:
        response.status_code = 200
    return order


@router.post("/leads", status_code=201)
async def create_lead(body: LeadIn, request: Request):
    ctx = build_ctx(request, body.context, fallback_path="/corporate")
    return {"id": await repo.create_lead(body, ctx)}


@router.post("/coupons/check")
async def check_coupon(body: CouponCheck):
    """Preview for the checkout's Apply button: is the code usable for this kind of order, and how much off.
    The order is priced again on the server when it's placed. Rate-limited with orders."""
    try:
        return coupons_repo.public_view(await coupons_repo.validate(body.code, body.kind))
    except coupons_repo.CouponError as e:
        raise HTTPException(e.status_code, e.message) from e

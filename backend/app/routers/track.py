from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from ..context import build_ctx, clamp_ts
from ..ingest import Item
from ..schemas import TrackBatch
from ..security import limit

router = APIRouter(prefix="/v1", tags=["tracking"])


@router.post("/track", status_code=202, dependencies=[Depends(limit("track"))])
async def track(body: TrackBatch, request: Request):
    """Batch of browser events. Returns immediately; a background writer persists them."""
    now = datetime.now(timezone.utc)
    ctx = build_ctx(request, body.context, fallback_path=body.events[0].path)
    events = [(clamp_ts(e.ts, now), e.type, e.path, e.props) for e in body.events]
    ok = request.app.state.buffer.offer(Item(body.visitor_id, body.session_id, ctx, now, events))
    if not ok:
        raise HTTPException(503, "Ingest queue is full", headers={"Retry-After": "5"})
    return {"accepted": len(events)}

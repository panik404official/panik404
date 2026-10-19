import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request
from tortoise import connections

log = logging.getLogger("health")
router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz():
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(request: Request):
    try:
        await asyncio.wait_for(connections.get("default").execute_query("SELECT 1"), timeout=3)
    except Exception as exc:  # noqa: BLE001
        log.exception("readiness check failed")
        raise HTTPException(503, "database unavailable") from exc
    buf = request.app.state.buffer
    return {"status": "ready", "queue_depth": buf._q.qsize(), "dropped_events": buf.dropped}

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from tortoise import Tortoise, connections
from tortoise.exceptions import DBConnectionError, OperationalError

from .config import get_settings
from .db import tortoise_config
from .ingest import IngestBuffer
from .models import Notification
from .routers import admin, auth, consent, contact, health, intake, orders, partners, track, users
from .repos import meetings as meetings_repo
from .security import RateLimiter

log = logging.getLogger("app")
MAX_BODY_BYTES = 64 * 1024
UPLOAD_PATHS = {"/v1/gifts/request", "/v1/bookings/request"}  # multipart with a receipt file
CONSENT_BODY_BYTES = 1024 * 1024
UNREAD_HEADER = "X-Unread-Notifications"  # consent autosave / submit carry drawn signatures as PNG data URLs


async def _maintain_partitions() -> None:
    while True:
        try:
            await connections.get("default").execute_query("SELECT ensure_event_partitions(3)")
        except Exception:  # noqa: BLE001
            log.exception("partition maintenance failed")
        await asyncio.sleep(6 * 3600)


async def _meeting_clock(s) -> None:
    """Sessions start and end on their own: scheduled -> live at the start time, live -> ended at the end."""
    while True:
        try:
            ended = await meetings_repo.tick(s)
            if ended:
                await meetings_repo.after_tick(s, ended)
        except Exception:  # noqa: BLE001
            log.exception("meeting clock failed")
        await asyncio.sleep(s.meeting_tick_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    # Schema is managed by migrations (never generate_schemas). Global fallback is required because
    # Starlette runs lifespan and requests in different tasks (Tortoise 1.x keeps state in a contextvar).
    await Tortoise.init(config=tortoise_config(s), _enable_global_fallback=True)
    buffer = IngestBuffer(s.track_queue_size, s.track_flush_batch, s.track_flush_interval)
    await buffer.start()
    maint = asyncio.create_task(_maintain_partitions(), name="partition-maintenance")
    clock = asyncio.create_task(_meeting_clock(s), name="meeting-clock")
    app.state.settings, app.state.buffer = s, buffer
    app.state.limiters = {"track": RateLimiter(s.rate_limit_track_per_min),
                          "orders": RateLimiter(s.rate_limit_orders_per_min),
                          "intake": RateLimiter(s.rate_limit_intake_per_15min, window=15 * 60),
                          "contact": RateLimiter(s.rate_limit_contact_per_15min, window=15 * 60),
                          "consent": RateLimiter(s.rate_limit_consent_per_min),
                          "login": RateLimiter(s.rate_limit_login_per_15min, window=15 * 60)}
    try:
        yield
    finally:
        for task in (maint, clock):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await buffer.stop()  # flush what is still queued before closing connections
        await Tortoise.close_connections()


def create_app() -> FastAPI:
    s = get_settings()
    prod = s.environment == "production"
    app = FastAPI(title="Panik API", version="1.0.0", lifespan=lifespan,
                  docs_url=None if prod else "/docs", redoc_url=None, openapi_url=None if prod else "/openapi.json")

    app.add_middleware(CORSMiddleware, allow_origins=s.cors_list, allow_methods=["GET", "POST", "PATCH", "DELETE"],
                       allow_headers=["Content-Type", "Idempotency-Key", "X-Admin-Key", "Authorization"],
                       expose_headers=[UNREAD_HEADER], max_age=600)

    @app.middleware("http")
    async def unread_count(request: Request, call_next):
        """Every panel response carries the signed-in user's unread notification count, so the bell stays
        current without the panel ever polling for it."""
        response = await call_next(request)
        if request.url.path.startswith(("/v1/admin/", "/v1/auth/me")):
            p = getattr(request.state, "principal", None)
            if p is not None and p.user is not None:
                n = await Notification.filter(user_id=p.user.id, read_at__isnull=True).count()
                response.headers[UNREAD_HEADER] = str(n)
        return response

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        cl = request.headers.get("content-length")
        path = request.url.path
        if path in UPLOAD_PATHS or (path.startswith("/v1/admin/consent-forms/") and path.endswith("/email")) or (
                path.startswith("/v1/partners/") and path.endswith("/verify")):
            cap = s.receipt_max_bytes + MAX_BODY_BYTES
        elif path.startswith("/v1/consent/") or (path.startswith("/v1/admin/consent-forms/")
                                                 and path.endswith("/sign")):
            cap = CONSENT_BODY_BYTES
        else:
            cap = MAX_BODY_BYTES
        if cl and cl.isdigit() and int(cl) > cap:
            return JSONResponse({"detail": "Payload too large"}, status_code=413)
        return await call_next(request)

    @app.exception_handler(OperationalError)
    @app.exception_handler(DBConnectionError)
    @app.exception_handler(asyncpg.InterfaceError)
    @app.exception_handler(asyncpg.ConnectionDoesNotExistError)
    async def db_down(_: Request, exc: Exception):
        log.error("database error: %s", exc)
        return JSONResponse({"detail": "Service temporarily unavailable"}, status_code=503,
                            headers={"Retry-After": "5"})

    for r in (health.router, track.router, orders.router, intake.router, contact.router, consent.router,
              partners.router, auth.router, users.router, admin.router):
        app.include_router(r)
    return app


app = create_app()

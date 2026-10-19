"""Shared helpers for writing visitors/sessions with the ORM (used by ingest and checkout)."""
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from ..models import Session, Visitor


@dataclass(slots=True)
class Ctx:
    ip_hash: str | None = None
    user_agent: str | None = None
    country: str | None = None
    landing_path: str | None = None
    referrer: str | None = None
    referrer_host: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None


def visitor_obj(vid: UUID, now: datetime, c: Ctx) -> Visitor:
    return Visitor(
        id=vid, first_seen_at=now, last_seen_at=now, first_landing_path=c.landing_path,
        first_referrer=c.referrer, first_referrer_host=c.referrer_host, first_utm_source=c.utm_source,
        first_utm_medium=c.utm_medium, first_utm_campaign=c.utm_campaign,
        first_source=c.utm_source or c.referrer_host or "direct",
        user_agent=c.user_agent, ip_hash=c.ip_hash, country=c.country,
    )


def session_obj(sid: UUID, vid: UUID, now: datetime, c: Ctx) -> Session:
    return Session(
        id=sid, visitor_id=vid, started_at=now, last_seen_at=now, landing_path=c.landing_path,
        referrer=c.referrer, referrer_host=c.referrer_host, utm_source=c.utm_source,
        utm_medium=c.utm_medium, utm_campaign=c.utm_campaign, user_agent=c.user_agent,
        ip_hash=c.ip_hash, country=c.country,
    )


async def upsert_visitors_sessions(visitors: list[Visitor], sessions: list[Session]) -> None:
    """Insert new rows; for existing ones only advance last_seen_at (first-touch data is never overwritten).
    Inputs must be de-duplicated; they are written in id order so concurrent writers lock rows consistently."""
    visitors.sort(key=lambda v: v.id)
    sessions.sort(key=lambda s: s.id)
    await Visitor.bulk_create(visitors, on_conflict=["id"], update_fields=["last_seen_at"])
    await Session.bulk_create(sessions, on_conflict=["id"], update_fields=["last_seen_at"])


async def ensure_visitor_session(vid: UUID, sid: UUID, ctx: Ctx, now: datetime) -> None:
    """Checkout may arrive before the buffered analytics events were flushed."""
    await upsert_visitors_sessions([visitor_obj(vid, now, ctx)], [session_obj(sid, vid, now, ctx)])

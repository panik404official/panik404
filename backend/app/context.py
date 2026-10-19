from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from fastapi import Request

from .repos.tracking import Ctx
from .schemas import TrackContext
from .security import client_ip, hash_ip


def build_ctx(request: Request, c: TrackContext | None, fallback_path: str | None = None) -> Ctx:
    st = request.app.state
    ip = client_ip(request, st.settings.trust_proxy)
    ref = c.referrer if c else None
    host = None
    if ref:
        try:
            host = urlparse(ref).hostname
        except ValueError:
            host = None
    country = request.headers.get("cf-ipcountry") or request.headers.get("x-vercel-ip-country")
    return Ctx(
        ip_hash=hash_ip(ip, st.settings.ip_hash_secret),
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
        country=country[:2].upper() if country else None,
        landing_path=(c.landing_path if c else None) or fallback_path,
        referrer=ref,
        referrer_host=host,
        utm_source=c.utm_source if c else None,
        utm_medium=c.utm_medium if c else None,
        utm_campaign=c.utm_campaign if c else None,
    )


def clamp_ts(ts_ms: int | None, now: datetime) -> datetime:
    """Client clocks lie: accept only timestamps from the last 24h, never the future."""
    if ts_ms is None:
        return now
    try:
        t = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return now
    return min(max(t, now - timedelta(hours=24)), now)

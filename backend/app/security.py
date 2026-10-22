import hashlib
import hmac
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


def client_ip(request: Request, trust_proxy: bool) -> str:
    if trust_proxy:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hash_ip(ip: str, secret: str) -> str:
    """Keyed hash: we can count unique IPs but never store or recover the address."""
    return hmac.new(secret.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]


class RateLimiter:
    """Per-process sliding window. For multi-instance deployments also rate-limit at the edge/proxy."""

    def __init__(self, limit: int, window: float = 60.0):
        self.limit, self.window = limit, window
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> float | None:
        """Returns None if allowed, otherwise seconds until the caller may retry."""
        now = time.monotonic()
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            return self.window - (now - q[0])
        q.append(now)
        if len(self._hits) > 50_000:  # opportunistic cleanup
            for k in [k for k, v in self._hits.items() if not v or now - v[-1] > self.window]:
                self._hits.pop(k, None)
        return None


def limit(bucket: str):
    async def dep(request: Request) -> None:
        st = request.app.state
        ip = hash_ip(client_ip(request, st.settings.trust_proxy), st.settings.ip_hash_secret)
        wait = st.limiters[bucket].check(ip)
        if wait is not None:
            raise HTTPException(429, "Too many requests", headers={"Retry-After": str(int(wait) + 1)})

    return dep

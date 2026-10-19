import ssl
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from .config import Settings

MODELS = ["app.models"]


def tortoise_config(settings: Settings, url: str | None = None) -> dict[str, Any]:
    """Translate a libpq-style Neon URL into a Tortoise (asyncpg) config.

    - ``sslmode`` -> asyncpg ``ssl`` context (certificate is verified; Neon uses public CAs)
    - ``channel_binding`` is a libpq-only option. asyncpg does not do SCRAM channel binding and Neon
      accepts clients that don't, so it is dropped.
    - ``statement_cache_size=0``: required behind PgBouncer (Neon's ``-pooler`` host, transaction mode)
    - ``max_inactive_connection_lifetime`` recycles idle sockets before Neon / PgBouncer drop them
    """
    u = urlsplit(url or settings.neon_db_url)
    q = {k: v[-1] for k, v in parse_qs(u.query).items()}
    sslmode = q.get("sslmode", "prefer")
    credentials: dict[str, Any] = {
        "host": u.hostname,
        "port": u.port or 5432,
        "user": unquote(u.username or ""),
        "password": unquote(u.password or ""),
        "database": u.path.lstrip("/"),
        "minsize": settings.db_pool_min,
        "maxsize": settings.db_pool_max,
        "statement_cache_size": 0,
        "max_inactive_connection_lifetime": 240,
        "command_timeout": 30,
    }
    if sslmode in ("require", "verify-ca", "verify-full"):
        credentials["ssl"] = ssl.create_default_context()
    return {
        "connections": {"default": {"engine": "tortoise.backends.asyncpg", "credentials": credentials}},
        "apps": {"models": {"models": MODELS, "default_connection": "default", "migrations": "app.migrations"}},
        "use_tz": True,
        "timezone": "UTC",
    }

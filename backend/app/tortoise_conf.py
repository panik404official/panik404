"""Config for the Tortoise CLI:  tortoise -c app.tortoise_conf.TORTOISE_ORM migrate

Uses NEON_DB_URL_DIRECT (non-pooled) when set, which is what Neon recommends for DDL."""
from .config import get_settings
from .db import tortoise_config

_s = get_settings()
TORTOISE_ORM = tortoise_config(_s, _s.migration_url)

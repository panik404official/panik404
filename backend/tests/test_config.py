import ssl

from app.config import Settings
from app.db import tortoise_config


def test_neon_url_is_translated_for_asyncpg():
    s = Settings(
        neon_db_url="postgresql://neondb_owner:p%40ss@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb"
                    "?sslmode=require&channel_binding=require",
        admin_api_key="a" * 16, ip_hash_secret="b" * 16)
    c = tortoise_config(s)["connections"]["default"]["credentials"]
    assert c["host"] == "ep-x-pooler.ap-southeast-1.aws.neon.tech" and c["port"] == 5432
    assert c["user"] == "neondb_owner" and c["password"] == "p@ss" and c["database"] == "neondb"
    assert isinstance(c["ssl"], ssl.SSLContext)           # sslmode=require -> verified TLS
    assert c["statement_cache_size"] == 0                 # PgBouncer-safe
    assert "channel_binding" not in c and "sslmode" not in c

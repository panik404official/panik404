import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

import asyncpg
import pytest

DB_URL = os.environ.get("TEST_DB_URL", "postgresql://tester:tester@localhost:5432/panik_test")
os.environ.update(
    NEON_DB_URL=DB_URL, ADMIN_API_KEY="test-admin-key-0123456789", IP_HASH_SECRET="test-ip-secret-0123456789",
    ENVIRONMENT="test", TRACK_FLUSH_INTERVAL="0.05", RATE_LIMIT_TRACK_PER_MIN="100000",
    RATE_LIMIT_ORDERS_PER_MIN="100000", RATE_LIMIT_INTAKE_PER_15MIN="100000", CORS_ORIGINS="http://localhost:5173",
    MAIL_USERNAME="", MAIL_PASSWORD="", ADMIN_EMAIL="team@panik.test",
)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402

ADMIN = {"X-Admin-Key": "test-admin-key-0123456789"}
ROOT = Path(__file__).resolve().parent.parent


def q(sql: str, *args):
    """Tiny sync helper to assert on the database independently of the app's own ORM session."""
    async def run():
        conn = await asyncpg.connect(DB_URL)
        try:
            await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
            return [dict(r) for r in await conn.fetch(sql, *args)]
        finally:
            await conn.close()
    return asyncio.run(run())


@pytest.fixture(scope="session", autouse=True)
def _schema():
    q("DROP SCHEMA public CASCADE")
    q("CREATE SCHEMA public")
    subprocess.run([sys.executable, "-m", "tortoise", "-c", "app.tortoise_conf.TORTOISE_ORM", "migrate"],
                   cwd=ROOT, check=True, capture_output=True)


@pytest.fixture(scope="session")
def client():
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def ids():
    return {"visitor_id": str(uuid.uuid4()), "session_id": str(uuid.uuid4())}


def wait_for(sql, *params, want=1, timeout=5.0):
    """Poll until the async writer has flushed."""
    end = time.time() + timeout
    while time.time() < end:
        rows = q(sql, *params)
        if len(rows) >= want:
            return rows
        time.sleep(0.05)
    raise AssertionError(f"timed out waiting for: {sql}")

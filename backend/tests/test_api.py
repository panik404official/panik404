import time
import uuid
from decimal import Decimal

from .conftest import ADMIN, q, wait_for

CUSTOMER = {"name": "Sara Khan", "email": "Sara@Example.com", "phone": "+92300111222"}


def test_health_and_ready(client):
    assert client.get("/healthz").json() == {"status": "ok"}
    r = client.get("/readyz")
    assert r.status_code == 200 and r.json()["status"] == "ready"


def test_track_persists_visitor_session_events(client, ids):
    body = {**ids,
            "context": {"landing_path": "/", "referrer": "https://www.instagram.com/p/x", "utm_source": "ig",
                        "utm_campaign": "oct"},
            "events": [{"type": "page_view", "path": "/"},
                       {"type": "product_view", "path": "/shop/product/x", "props": {"product_id": "x"}},
                       {"type": "add_to_cart", "props": {"product_id": "x", "qty": 1}}]}
    r = client.post("/v1/track", json=body, headers={"user-agent": "pytest", "x-forwarded-for": "203.0.113.7",
                                                       "cf-ipcountry": "pk"})
    assert r.status_code == 202 and r.json() == {"accepted": 3}
    rows = wait_for("SELECT * FROM events WHERE visitor_id=$1::uuid ORDER BY id", ids["visitor_id"], want=3)
    assert [x["type"] for x in rows] == ["page_view", "product_view", "add_to_cart"]
    assert rows[1]["props"] == {"product_id": "x"}
    v = q("SELECT * FROM visitors WHERE id=$1::uuid", ids["visitor_id"])[0]
    assert v["first_utm_source"] == "ig" and v["first_source"] == "ig"
    assert v["first_referrer_host"] == "www.instagram.com"
    assert v["country"] == "PK" and v["ip_hash"] and "203.0.113.7" not in v["ip_hash"]
    s = q("SELECT * FROM sessions WHERE id=$1::uuid", ids["session_id"])[0]
    assert s["landing_path"] == "/" and s["utm_campaign"] == "oct"


def test_repeat_batches_keep_first_touch_and_advance_last_seen(client, ids):
    client.post("/v1/track", json={**ids, "context": {"utm_source": "first"},
                                    "events": [{"type": "page_view", "path": "/"}]})
    wait_for("SELECT 1 FROM events WHERE session_id=$1::uuid", ids["session_id"], want=1)
    before = q("SELECT last_seen_at FROM visitors WHERE id=$1::uuid", ids["visitor_id"])[0]["last_seen_at"]
    time.sleep(0.05)
    for _ in range(2):
        client.post("/v1/track", json={**ids, "context": {"utm_source": "second"},
                                        "events": [{"type": "page_view", "path": "/shop"}]})
    wait_for("SELECT 1 FROM events WHERE session_id=$1::uuid", ids["session_id"], want=3)
    v = q("SELECT first_source, last_seen_at FROM visitors WHERE id=$1::uuid", ids["visitor_id"])[0]
    assert v["first_source"] == "first" and v["last_seen_at"] > before  # first touch is never overwritten
    assert len(q("SELECT 1 FROM sessions WHERE id=$1::uuid", ids["session_id"])) == 1


def test_track_validation(client, ids):
    assert client.post("/v1/track", json={**ids, "events": [{"type": "order_paid"}]}).status_code == 422
    assert client.post("/v1/track", json={**ids, "events": [{"type": "page_view"}] * 51}).status_code == 422
    big = client.post("/v1/track", json={**ids, "events": [{"type": "custom", "props": {"x": "a" * 3000}}]})
    assert big.status_code == 422
    assert client.post("/v1/track", json={"visitor_id": "nope", "session_id": "x", "events": []}).status_code == 422


def test_future_and_ancient_timestamps_are_clamped(client, ids):
    now_ms = int(time.time() * 1000)
    client.post("/v1/track", json={**ids, "events": [
        {"type": "page_view", "ts": now_ms + 10 * 86_400_000}, {"type": "page_view", "ts": 1000}]})
    rows = wait_for("SELECT occurred_at, now() AS n FROM events WHERE session_id=$1::uuid", ids["session_id"], want=2)
    assert all(abs((r["n"] - r["occurred_at"]).total_seconds()) < 90_000 for r in rows)
    assert all(r["occurred_at"] <= r["n"] for r in rows)


def test_product_order_uses_server_prices(client, ids):
    r = client.post("/v1/orders", json={**ids, "kind": "product", "customer": CUSTOMER, "items": [
        {"product_id": "breakup-recovery-journal", "quantity": 2},
        {"product_id": "overthinking-reset-journal", "quantity": 1}]})
    assert r.status_code == 201, r.text
    o = r.json()
    assert Decimal(o["total"]) == Decimal("3999") * 2 + Decimal("3850") and o["status"] == "pending"
    assert o["order_no"] >= 1001
    v = q("SELECT customer_id FROM visitors WHERE id=$1::uuid", ids["visitor_id"])[0]
    assert v["customer_id"] is not None  # anonymous history stitched to the customer
    assert q("SELECT email FROM customers WHERE id=$1", v["customer_id"])[0]["email"] == "sara@example.com"
    assert len(q("SELECT 1 FROM order_items WHERE order_id=$1::uuid", o["id"])) == 2
    assert len(q("SELECT 1 FROM events WHERE type='order_created' AND visitor_id=$1::uuid", ids["visitor_id"])) == 1


def test_client_cannot_set_price_or_unknown_product(client, ids):
    r = client.post("/v1/orders", json={**ids, "kind": "product", "customer": CUSTOMER,
                                        "items": [{"product_id": "nope", "quantity": 1}]})
    assert r.status_code == 422
    r = client.post("/v1/orders", json={**ids, "kind": "product", "customer": CUSTOMER, "total": 1,
                                        "items": [{"product_id": "breakup-recovery-journal", "quantity": 1, "price": 1}]})
    assert r.status_code == 422  # extra fields rejected


def test_gift_bundle_discount_matches_storefront(client, ids):
    o = client.post("/v1/orders", json={**ids, "kind": "gift", "customer": CUSTOMER, "quantity": 3,
                                        "delivery": "email", "recipient": "a friend"}).json()
    assert Decimal(o["subtotal"]) == 26970 and Decimal(o["discount"]) == Decimal("5394.00")
    assert Decimal(o["total"]) == Decimal("21576.00")
    r = client.post("/v1/orders", json={**ids, "kind": "gift", "customer": CUSTOMER, "quantity": 20})
    assert Decimal(r.json()["discount"]) == Decimal(8990 * 20) / 2  # capped at 50%


def test_booking_rejects_clinical_fields(client, ids):
    ok = client.post("/v1/orders", json={**ids, "kind": "booking", "customer": CUSTOMER,
                                         "preferred_date": "2026-11-02", "preferred_time": "4:30 PM"})
    assert ok.status_code == 201 and Decimal(ok.json()["total"]) == 9995
    leak = client.post("/v1/orders", json={**ids, "kind": "booking", "customer": CUSTOMER, "suicidal": "Yes"})
    assert leak.status_code == 422


def test_idempotency_key(client, ids):
    payload = {**ids, "kind": "booking", "customer": CUSTOMER}
    key = {"Idempotency-Key": str(uuid.uuid4())}
    a = client.post("/v1/orders", json=payload, headers=key)
    b = client.post("/v1/orders", json=payload, headers=key)
    assert a.status_code == 201 and b.status_code == 200 and a.json()["id"] == b.json()["id"]
    assert len(q("SELECT 1 FROM orders WHERE visitor_id=$1::uuid", ids["visitor_id"])) == 1


def test_admin_requires_key(client):
    assert client.get("/v1/admin/orders").status_code == 401
    assert client.get("/v1/admin/orders", headers={"X-Admin-Key": "wrong"}).status_code == 401
    r = client.get("/v1/admin/orders", headers=ADMIN)
    assert r.status_code == 200 and {"id", "order_no", "email", "name", "status"} <= set(r.json()["items"][0])


def test_payment_flow_and_transitions(client, ids):
    o = client.post("/v1/orders", json={**ids, "kind": "booking", "customer": CUSTOMER}).json()
    url = f"/v1/admin/orders/{o['id']}/status"
    r = client.patch(url, json={"status": "paid", "provider": "bank_transfer", "provider_ref": "TX1"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["status"] == "paid"
    assert q("SELECT paid_at FROM orders WHERE id=$1::uuid", o["id"])[0]["paid_at"] is not None
    assert len(q("SELECT 1 FROM payments WHERE order_id=$1::uuid", o["id"])) == 1
    assert client.patch(url, json={"status": "pending"}, headers=ADMIN).status_code == 409
    assert client.patch(url, json={"status": "refunded"}, headers=ADMIN).status_code == 200
    assert client.patch(f"/v1/admin/orders/{uuid.uuid4()}/status", json={"status": "paid"}, headers=ADMIN).status_code == 404


def test_journey_funnel_and_sources(client, ids):
    client.post("/v1/track", json={**ids, "context": {"utm_source": "newsletter"}, "events": [
        {"type": "page_view", "path": "/"}, {"type": "product_view", "path": "/shop/product/a"},
        {"type": "add_to_cart"}, {"type": "begin_checkout"}]})
    wait_for("SELECT 1 FROM events WHERE session_id=$1::uuid", ids["session_id"], want=4)
    o = client.post("/v1/orders", json={**ids, "kind": "product", "customer": CUSTOMER,
                                        "items": [{"product_id": "addiction-recovery-journal", "quantity": 1}]}).json()
    client.patch(f"/v1/admin/orders/{o['id']}/status", json={"status": "paid"}, headers=ADMIN)

    j = client.get(f"/v1/admin/visitors/{ids['visitor_id']}/journey", headers=ADMIN).json()
    types = [e["type"] for e in j["events"]]
    assert types[:4] == ["page_view", "product_view", "add_to_cart", "begin_checkout"]
    assert "order_created" in types and "order_paid" in types
    assert j["visitor"]["customer_email"] == "sara@example.com" and j["orders"][0]["status"] == "paid"

    f = client.get("/v1/admin/analytics/funnel", headers=ADMIN).json()
    stages = {s["stage"]: s["visitors"] for s in f["stages"]}
    assert stages["visitors"] >= 1 and stages["paid"] >= 1 and stages["began_checkout"] >= 1
    assert Decimal(str(f["revenue"])) >= 3995

    src = client.get("/v1/admin/analytics/sources", headers=ADMIN).json()["items"]
    nl = next(s for s in src if s["source"] == "newsletter")
    assert nl["buyers"] >= 1 and Decimal(str(nl["revenue"])) >= 3995
    assert client.get(f"/v1/admin/visitors/{uuid.uuid4()}/journey", headers=ADMIN).status_code == 404


def test_lead_and_payload_cap(client, ids):
    r = client.post("/v1/leads", json={**ids, "name": "HR Lead", "email": "HR@corp.com", "team_size": 40})
    assert r.status_code == 201
    assert q("SELECT email FROM leads WHERE id=$1::uuid", r.json()["id"])[0]["email"] == "hr@corp.com"
    huge = client.post("/v1/track", content=b"x" * 70_000, headers={"content-type": "application/json"})
    assert huge.status_code == 413


def test_partitions_and_retention_helper():
    names = {r["relname"] for r in q(
        "SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid WHERE i.inhparent='events'::regclass")}
    assert "events_default" in names and sum(n.startswith("events_20") for n in names) >= 4
    assert q("SELECT drop_event_partitions_older_than(240) AS n")[0]["n"] == 0

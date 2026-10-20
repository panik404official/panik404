import uuid
from decimal import Decimal

from .conftest import ADMIN, wait_for

CUST = {"name": "Ayesha Malik", "email": "Ayesha.Panel@Example.com", "phone": "+92300555777"}


def _buyer(client, ids):
    client.post("/v1/track", json={**ids, "context": {"utm_source": "panel-test", "landing_path": "/"}, "events": [
        {"type": "page_view", "path": "/"}, {"type": "product_view", "path": "/shop/product/a",
                                               "props": {"product_id": "addiction-recovery-journal"}},
        {"type": "add_to_cart", "props": {"product_id": "addiction-recovery-journal"}}]})
    wait_for("SELECT 1 FROM events WHERE session_id=$1::uuid", ids["session_id"], want=3)
    o = client.post("/v1/orders", json={**ids, "kind": "product", "customer": CUST,
                                        "items": [{"product_id": "addiction-recovery-journal", "quantity": 2}]}).json()
    client.patch(f"/v1/admin/orders/{o['id']}/status", json={"status": "paid", "provider": "bank", "provider_ref": "P1"},
                 headers=ADMIN)
    client.post("/v1/leads", json={**ids, "name": "Ayesha", "email": CUST["email"], "team_size": 12, "message": "hi"})
    return o


def test_admin_panel_endpoints_need_key(client):
    for path in ("/v1/admin/overview", "/v1/admin/customers", "/v1/admin/visitors", "/v1/admin/leads",
                 "/v1/admin/events", "/v1/admin/products", "/v1/admin/payments",
                 f"/v1/admin/customers/{uuid.uuid4()}", f"/v1/admin/orders/{uuid.uuid4()}"):
        assert client.get(path).status_code == 401, path


def test_customer_profile_has_everything(client, ids):
    o = _buyer(client, ids)
    lst = client.get("/v1/admin/customers", params={"q": "ayesha.panel"}, headers=ADMIN).json()
    assert lst["total"] == 1
    row = lst["items"][0]
    assert row["email"] == "ayesha.panel@example.com" and row["paid_orders"] == 1 and row["devices"] == 1
    assert Decimal(str(row["spent"])) == Decimal(str(o["total"]))
    for sort in ("recent", "spent", "orders", "last_seen", "name"):
        assert client.get("/v1/admin/customers", params={"sort": sort}, headers=ADMIN).status_code == 200
    # wildcards in the search are literal
    assert client.get("/v1/admin/customers", params={"q": "%"}, headers=ADMIN).json()["total"] == 0

    p = client.get(f"/v1/admin/customers/{row['id']}", headers=ADMIN).json()
    assert p["customer"]["phone"] == "+92300555777"
    assert p["orders"][0]["items"][0]["quantity"] == 2 and p["orders"][0]["payments"][0]["provider_ref"] == "P1"
    assert p["visitors"][0]["first_source"] == "panel-test" and len(p["sessions"]) == 1
    types = {e["type"] for e in p["events"]}
    assert {"page_view", "product_view", "add_to_cart", "order_created", "order_paid", "lead_created"} <= types
    assert p["leads"][0]["team_size"] == 12
    s = p["stats"]
    assert s["paid_orders"] == 1 and s["acquisition_source"] == "panel-test"
    assert s["products_bought"][0]["quantity"] == 2
    assert s["products_viewed"][0]["product_id"] == "addiction-recovery-journal"
    assert client.get(f"/v1/admin/customers/{uuid.uuid4()}", headers=ADMIN).status_code == 404


def test_order_detail_search_and_feeds(client, ids):
    o = _buyer(client, ids)
    d = client.get(f"/v1/admin/orders/{o['id']}", headers=ADMIN).json()
    assert d["customer"]["email"] == "ayesha.panel@example.com" and d["visitor"]["id"] == ids["visitor_id"]
    assert [e["type"] for e in d["session_events"]][:3] == ["page_view", "product_view", "add_to_cart"]
    assert client.get(f"/v1/admin/orders/{uuid.uuid4()}", headers=ADMIN).status_code == 404

    by_no = client.get("/v1/admin/orders", params={"q": f"#{o['order_no']}"}, headers=ADMIN).json()["items"]
    assert [x["id"] for x in by_no] == [o["id"]]
    assert all(x["kind"] == "booking" for x in
               client.get("/v1/admin/orders", params={"kind": "booking"}, headers=ADMIN).json()["items"])

    ov = client.get("/v1/admin/overview", headers=ADMIN).json()
    assert ov["totals"]["customers"] >= 1 and Decimal(str(ov["totals"]["revenue"])) > 0

    vis = client.get("/v1/admin/visitors", params={"identified": "true"}, headers=ADMIN).json()["items"]
    assert any(v["id"] == ids["visitor_id"] and v["customer_email"] for v in vis)
    assert all(v["customer_id"] is None for v in
               client.get("/v1/admin/visitors", params={"identified": "false"}, headers=ADMIN).json()["items"])

    ev = client.get("/v1/admin/events", params={"limit": 500}, headers=ADMIN).json()["items"]
    assert any(e["visitor_id"] == ids["visitor_id"] and e["customer_email"] for e in ev)
    leads = client.get("/v1/admin/leads", params={"q": "ayesha"}, headers=ADMIN).json()["items"]
    assert leads and leads[0]["customer_id"]
    prods = client.get("/v1/admin/products", headers=ADMIN).json()["items"]
    assert next(p for p in prods if p["id"] == "addiction-recovery-journal")["units_sold"] >= 2
    pays = client.get("/v1/admin/payments", headers=ADMIN).json()["items"]
    assert pays and pays[0]["email"]

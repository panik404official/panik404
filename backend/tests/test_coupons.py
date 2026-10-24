"""Coupons: admins create them; checkout applies them on the server; limits and cancellations count uses."""
import json
import uuid

from .conftest import ADMIN, future_date
from .test_meetings import BOOKING, PNG, mails  # noqa: F401  (fixture)
from .test_users_auth import bearer, boss, make_user  # noqa: F401  (boss is a fixture)


def _coupon(client, **kw):
    body = {"code": "spring 25", "discount_type": "percent", "value": 25, **kw}
    return client.post("/v1/admin/coupons", json=body, headers=ADMIN)


def _order(client, ids, kind="booking", coupon=None, **extra):
    body = {**ids, "kind": kind, "customer": {"name": "Sara", "email": "sara@example.com", "phone": "0300"},
            **({"coupon": coupon} if coupon is not None else {}), **extra}
    if kind == "booking":
        body.update(preferred_date=future_date(), preferred_time="4:05 PM")
    if kind == "product":
        body["items"] = [{"product_id": extra.pop("pid", "journal"), "quantity": 1}] if "items" not in body else body["items"]
    return client.post("/v1/orders", json=body, headers={"Idempotency-Key": str(uuid.uuid4())})


def test_only_admins_manage_coupons(client, boss):
    psych, pt = make_user(client, boss, permissions=["consent_assigned", "orders", "catalogue"])
    assert client.get("/v1/admin/coupons", headers=bearer(pt)).status_code == 403
    assert client.post("/v1/admin/coupons", json={"code": "X1X", "discount_type": "percent", "value": 5},
                       headers=bearer(pt)).status_code == 403
    r = client.post("/v1/admin/coupons", json={"code": "staff-10", "discount_type": "percent", "value": 10},
                    headers=bearer(boss["token"]))
    assert r.status_code == 201 and r.json()["code"] == "STAFF-10" and r.json()["label"] == "10% off"


def test_coupon_validation_rules(client):
    assert _coupon(client, value=150).status_code == 422
    assert _coupon(client, code="a!").status_code == 422
    assert _coupon(client, applies_to=[]).status_code == 422
    assert _coupon(client).status_code == 201
    assert _coupon(client, code="Spring25").status_code == 409  # same code, any spacing or case


def test_checkout_applies_coupon_and_counts_uses(client, ids, mails):
    c = _coupon(client, code="BOOK 25", max_uses=1, applies_to=["booking"]).json()
    chk = client.post("/v1/coupons/check", json={"code": " book25 ", "kind": "booking"})
    assert chk.status_code == 200 and chk.json()["label"] == "25% off"
    assert client.post("/v1/coupons/check", json={"code": "BOOK25", "kind": "gift"}).json()["detail"] \
        == "This coupon can only be used for session bookings."
    assert client.post("/v1/coupons/check", json={"code": "NOPE", "kind": "booking"}).status_code == 422

    r = _order(client, ids, coupon="book25")
    assert r.status_code == 201, r.text
    o = r.json()
    full = float(o["subtotal"])
    assert float(o["discount"]) == round(full * 0.25) and float(o["total"]) == full - round(full * 0.25)
    d = client.get(f"/v1/admin/orders/{o['id']}", headers=ADMIN).json()["details"]
    assert d["coupon"] == "BOOK25" and d["coupon_label"] == "25% off"

    # the single use is taken
    assert _order(client, ids, coupon="BOOK25").json()["detail"] == "This coupon code has been used up."
    # the booking email shows the applied coupon
    client.post("/v1/bookings/request", data={"data": json.dumps({"order_id": o["id"], **BOOKING})},
                files={"receipt": ("pay.png", PNG, "image/png")})
    assert any("BOOK25 (25% off" in m.text for m in mails)

    # cancelling gives the use back, once
    for _ in range(2):
        client.patch(f"/v1/admin/orders/{o['id']}/status", json={"status": "cancelled"}, headers=ADMIN)
    row = next(x for x in client.get("/v1/admin/coupons", headers=ADMIN).json()["items"] if x["id"] == c["id"])
    assert row["uses"] == 0 and row["state"] == "active"
    assert _order(client, ids, coupon="BOOK25").status_code == 201
    # used coupons can't be deleted, only switched off
    assert client.delete(f"/v1/admin/coupons/{c['id']}", headers=ADMIN).status_code == 409
    r = client.patch(f"/v1/admin/coupons/{c['id']}", json={"active": False}, headers=ADMIN)
    assert r.json()["state"] == "off"
    assert client.post("/v1/coupons/check", json={"code": "BOOK25", "kind": "booking"}).status_code == 422


def test_fixed_amount_never_goes_below_zero_and_unused_can_be_deleted(client, ids):
    c = _coupon(client, code="FREE", discount_type="amount", value=999999).json()
    o = _order(client, ids, coupon="free").json()
    assert float(o["total"]) == 0 and float(o["discount"]) == float(o["subtotal"])
    c2 = _coupon(client, code="UNUSED").json()
    assert client.delete(f"/v1/admin/coupons/{c2['id']}", headers=ADMIN).status_code == 204
    assert c["label"] == "Rs 999,999 off"

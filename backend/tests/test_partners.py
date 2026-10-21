import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.routers import intake

from .conftest import ADMIN, future_date, q

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
WHO = {"name": "Bilal Ibex", "email": "bilal@ibex.example", "phone": "0300 1112223", "employee_id": "IBX-4471",
       "department": "Support"}
BOOKING_FIELDS = {
    "age": 30, "role": "Corporate Employee", "concern": ["Burnout"], "desc": None, "duration": "1-6 months",
    "distress": 5, "danger": "No", "suicidal": "No", "harm": "No", "medical": "No", "treatment": "None",
    "notes": "Evenings", "consent": True, "coupon": None,
}


@pytest.fixture()
def sent(monkeypatch):
    mails = []

    async def fake_send(_settings, *batch):
        mails.extend(batch)

    monkeypatch.setattr(intake, "send_mail", fake_send)
    return mails


def verify(client, ids=None, doc=("id-card.png", PNG, "image/png"), **over):
    data = {**WHO, **(ids or {}), **over}
    return client.post("/v1/partners/ibex/verify", data={"data": json.dumps(data)}, files={"document": doc})


def book(client, ids, verification_id=None, email=WHO["email"], **over):
    body = {**ids, "kind": "booking", "customer": {"name": WHO["name"], "email": email, "phone": WHO["phone"]},
            "preferred_date": future_date(), "preferred_time": "4:00 PM", **over}
    if verification_id:
        body["partner_verification_id"] = verification_id
    return client.post("/v1/orders", json=body, headers={"Idempotency-Key": str(uuid.uuid4())})


def test_partner_info_and_unknown_partner(client):
    assert client.get("/v1/partners/ibex").json() == {"slug": "ibex", "name": "Ibex", "discount_pct": 25}
    assert client.get("/v1/partners/nope").status_code == 404
    assert verify(client).status_code == 201
    r = client.post("/v1/partners/nope/verify", data={"data": json.dumps(WHO)},
                    files={"document": ("a.png", PNG, "image/png")})
    assert r.status_code == 404


def test_verification_is_stored_with_the_document(client, ids):
    r = verify(client, ids)
    assert r.status_code == 201, r.text
    vid = r.json()["id"]
    row = q("SELECT * FROM partner_verifications WHERE id = $1", uuid.UUID(vid))[0]
    assert row["status"] == "pending" and row["employee_id"] == "IBX-4471" and bytes(row["file_data"]) == PNG
    assert row["file_mime"] == "image/png" and row["order_id"] is None


def test_verification_rejects_bad_input(client):
    assert verify(client, doc=("x.png", b"not an image", "image/png")).status_code == 415
    assert verify(client, employee_id="").status_code == 422
    assert verify(client, email="nope").status_code == 422


def test_discounted_booking_emails_team_with_id_and_links_records(client, ids, sent):
    vid = verify(client, ids).json()["id"]
    r = book(client, ids, vid)
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["subtotal"] == "9995.00" and o["discount"] == "2499.00" and o["total"] == "7496.00"
    details = q("SELECT details FROM orders WHERE id = $1", uuid.UUID(o["id"]))[0]["details"]
    assert details["partner"] == "ibex" and details["discount_pct"] == 25 and details["employee_id"] == "IBX-4471"
    assert q("SELECT order_id FROM partner_verifications WHERE id = $1", uuid.UUID(vid))[0]["order_id"] == \
        uuid.UUID(o["id"])

    r = client.post("/v1/bookings/request", data={"data": json.dumps({"order_id": o["id"], **BOOKING_FIELDS})},
                    files={"receipt": ("receipt.png", PNG, "image/png")})
    assert r.status_code == 200, r.text
    admin, _customer = sent
    assert admin.subject.startswith("Ibex booking #")
    assert "Employee ID: IBX-4471" in admin.text and "Total: Rs 7,496" in admin.text and "Coupon" not in admin.text
    assert [a.filename for a in admin.attachments] == ["receipt.png", "id-id-card.png"]

    # each verification books one session
    assert book(client, ids, vid).status_code == 409


def test_verification_must_match_email_and_not_be_rejected_or_old(client, ids):
    vid = verify(client, ids).json()["id"]
    assert book(client, ids, vid, email="someone@else.example").status_code == 422
    q("UPDATE partner_verifications SET status = 'rejected' WHERE id = $1", uuid.UUID(vid))
    assert book(client, ids, vid).status_code == 409
    old = verify(client, ids).json()["id"]
    q("UPDATE partner_verifications SET created_at = now() - interval '8 days' WHERE id = $1", uuid.UUID(old))
    assert book(client, ids, old).status_code == 409
    assert book(client, ids, str(uuid.uuid4())).status_code == 422


def test_bookings_need_48_hours_notice(client, ids):
    now = datetime.now(timezone.utc)
    soon = (now + timedelta(hours=47)).isoformat()
    later = (now + timedelta(hours=49)).isoformat()
    r = book(client, ids, preferred_at=soon)
    assert r.status_code == 422 and "48 hours" in r.json()["detail"]
    assert book(client, ids, preferred_at=later).status_code == 201
    # without preferred_at the date and time are read as Pakistan time
    today = datetime.now(timezone.utc).date().isoformat()
    assert book(client, ids, preferred_date=today, preferred_time="11:59 PM").status_code == 422
    assert book(client, ids, preferred_time="25:00 PM").status_code == 422
    assert book(client, ids, preferred_at="2030-01-01T10:00:00").status_code == 422  # no offset


def test_admin_lists_views_and_reviews_verifications(client, ids):
    vid = verify(client, ids, employee_id="IBX-ADMIN-1").json()["id"]
    assert client.get("/v1/admin/partner-verifications").status_code == 401
    items = client.get("/v1/admin/partner-verifications", params={"q": "IBX-ADMIN-1"}, headers=ADMIN).json()["items"]
    assert items[0]["id"] == vid and items[0]["partner_name"] == "Ibex" and "file_data" not in items[0]
    f = client.get(f"/v1/admin/partner-verifications/{vid}/file", headers=ADMIN)
    assert f.status_code == 200 and f.content == PNG and f.headers["content-type"] == "image/png"
    r = client.patch(f"/v1/admin/partner-verifications/{vid}", json={"status": "approved", "admin_note": "ID ok"},
                     headers=ADMIN)
    assert r.json()["status"] == "approved" and r.json()["admin_note"] == "ID ok" and r.json()["reviewed_at"]
    pending = client.get("/v1/admin/partner-verifications", params={"status": "pending", "q": "IBX-ADMIN-1"},
                         headers=ADMIN).json()["items"]
    assert pending == []

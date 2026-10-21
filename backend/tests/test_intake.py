import json
import uuid

import pytest

from app.routers import intake

from .conftest import future_date, q

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
BOOKING_FIELDS = {
    "age": 27, "role": "Student", "concern": ["Anxiety", "Burnout"], "desc": "Hard month.",
    "duration": "1-4 weeks", "distress": 6, "danger": "No", "suicidal": "Prefer Not to Say", "harm": "No",
    "medical": "No", "treatment": "None", "notes": "Evenings work.", "consent": True, "coupon": "EMP-42",
}


@pytest.fixture()
def sent(monkeypatch):
    mails = []

    async def fake_send(_settings, *batch):
        mails.extend(batch)

    monkeypatch.setattr(intake, "send_mail", fake_send)
    return mails


def order(client, ids, **body):
    customer = {"name": "Sara Buyer", "email": "sara@example.com", "phone": "0300"}
    r = client.post("/v1/orders", json={**ids, "customer": customer, **body},
                    headers={"Idempotency-Key": str(uuid.uuid4())})
    assert r.status_code == 201, r.text
    return r.json()


def submit(client, path, data, receipt=("receipt.png", PNG, "image/png")):
    return client.post(path, data={"data": json.dumps(data)}, files={"receipt": receipt})


def test_gift_request_emails_team_and_recipient(client, ids, sent):
    o = order(client, ids, kind="gift", quantity=3, recipient="Ayesha", delivery="email",
              recipient_email="ayesha@example.com", message="Thinking of you")
    r = submit(client, "/v1/gifts/request", {"order_id": o["id"], "coupon": "SPRING"})
    assert r.status_code == 200, r.text
    assert r.json()["order_no"] == o["order_no"]

    admin, recipient = sent
    assert admin.to == "team@panik.test" and admin.reply_to == "sara@example.com"
    assert f"#{o['order_no']}" in admin.subject
    assert "Total: Rs 21,576" in admin.text and "Coupon: SPRING" in admin.text  # server price, not client's
    assert [a.mime for a in admin.attachments] == ["image/png", "application/pdf"]
    assert recipient.to == "ayesha@example.com" and recipient.attachments[0].content.startswith(b"%PDF-")

    details = q("SELECT details FROM orders WHERE id = $1", uuid.UUID(o["id"]))[0]["details"]
    assert details["request_submitted_at"] and details["coupon"] == "SPRING"
    assert details["receipt"]["content_type"] == "image/png"

    again = submit(client, "/v1/gifts/request", {"order_id": o["id"]})
    assert again.status_code == 409


def test_posted_gift_only_emails_team(client, ids, sent):
    o = order(client, ids, kind="gift", quantity=1, recipient="Ali", delivery="post",
              address="12 Street, Lahore 54000")
    assert submit(client, "/v1/gifts/request", {"order_id": o["id"]}).status_code == 200
    assert len(sent) == 1 and "Mailing address: 12 Street, Lahore 54000" in sent[0].text
    assert [a.mime for a in sent[0].attachments] == ["image/png"]


def test_booking_request_emails_but_never_stores_screening_answers(client, ids, sent):
    o = order(client, ids, kind="booking", preferred_date=future_date(), preferred_time="4:05 PM")
    r = submit(client, "/v1/bookings/request", {"order_id": o["id"], **BOOKING_FIELDS},
               receipt=("scan.pdf", b"%PDF-1.4 test", "application/pdf"))
    assert r.status_code == 200, r.text

    admin, customer = sent
    assert "Suicidal thoughts: Prefer Not to Say" in admin.text and "Preferred time: 4:05 PM" in admin.text
    assert admin.attachments[0].filename == "scan.pdf" and customer.to == "sara@example.com"

    stored = json.dumps(q("SELECT details FROM orders WHERE id = $1", uuid.UUID(o["id"]))[0]["details"])
    for answer in ("Prefer Not to Say", "Burnout", "Hard month", "suicidal", "distress"):
        assert answer not in stored


def test_booking_request_validation(client, ids, sent):
    o = order(client, ids, kind="booking")
    for bad in ({"consent": False}, {"concern": []}, {"concern": ["Made up"]}, {"distress": 11}, {"extra": 1}):
        r = submit(client, "/v1/bookings/request", {"order_id": o["id"], **BOOKING_FIELDS, **bad})
        assert r.status_code == 422, bad
    # an order of the wrong kind is not found
    assert submit(client, "/v1/gifts/request", {"order_id": o["id"]}).status_code == 404
    assert not sent


def test_receipt_must_be_a_real_image_or_pdf(client, ids, sent):
    o = order(client, ids, kind="gift", quantity=1, recipient="A", delivery="post", address="Somewhere 123")
    path, data = "/v1/gifts/request", {"order_id": o["id"]}
    assert submit(client, path, data, ("r.png", b"not an image", "image/png")).status_code == 415
    assert submit(client, path, data, ("r.png", b"", "image/png")).status_code == 422
    too_big = PNG + b"\x00" * (5 * 1024 * 1024)
    assert submit(client, path, data, ("r.png", too_big, "image/png")).status_code == 413
    assert not sent


def test_mail_not_configured_leaves_order_retryable(client, ids):
    o = order(client, ids, kind="gift", quantity=1, recipient="A", delivery="post", address="Somewhere 123")
    r = submit(client, "/v1/gifts/request", {"order_id": o["id"]})
    assert r.status_code == 503
    details = q("SELECT details FROM orders WHERE id = $1", uuid.UUID(o["id"]))[0]["details"]
    assert "request_submitted_at" not in details

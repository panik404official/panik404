import uuid

import pytest

from app import notify as notify_mod
from app.routers import consent as consent_router, contact as contact_router

from .conftest import ADMIN, q

SIG = "data:image/png;base64,iVBORw0KGgo="
FULL = {
    "name": "Sara Client", "dob": "1995-04-02", "phone": "0300 1234567", "email": "Sara.Client@example.com",
    "ename": "Ali", "ephone": "0300 7654321", "session_time": "2026-11-02T16:00", "ack": True,
    "sig_client": SIG,
}
PSYCH = {"pname": "Mashal Zia", "pqual": "Clinical Psychologist", "sig_psych": SIG}


@pytest.fixture()
def sent(monkeypatch):
    mails = []

    async def fake_send(_settings, *batch):
        mails.extend(batch)

    monkeypatch.setattr(contact_router, "send_mail", fake_send)
    monkeypatch.setattr(consent_router, "send_mail", fake_send)
    monkeypatch.setattr(notify_mod, "send_mail", fake_send)
    return mails


def new_form(client, **body):
    r = client.post("/v1/admin/consent-forms", json=body, headers=ADMIN)
    assert r.status_code == 201, r.text
    return r.json()


# ---- contact -------------------------------------------------------------------------------------------
def test_contact_emails_team_and_sender_and_is_listed(client, ids, sent):
    r = client.post("/v1/contact", json={**ids, "name": "Hina", "email": "Hina@Example.com", "phone": "0300",
                                         "topic": "Booking", "message": "Can I move my session?"})
    assert r.status_code == 201, r.text
    team, sender = sent
    assert team.to == "team@panik.test" and team.reply_to == "hina@example.com"
    assert "Can I move my session?" in team.text and "Topic: Booking" in team.text
    assert sender.to == "hina@example.com" and "not an emergency" in sender.text

    rows = client.get("/v1/admin/contact-messages", params={"q": "move my"}, headers=ADMIN).json()["items"]
    assert rows[0]["name"] == "Hina" and rows[0]["topic"] == "Booking"


def test_contact_without_mail_keeps_nothing(client):
    before = q("SELECT count(*) AS n FROM contact_messages")[0]["n"]
    r = client.post("/v1/contact", json={"name": "A", "email": "a@example.com", "message": "hi"})
    assert r.status_code == 503
    assert q("SELECT count(*) AS n FROM contact_messages")[0]["n"] == before


def test_contact_validation(client, sent):
    for bad in ({"email": "nope"}, {"message": ""}, {"topic": "Made up"}, {"extra": 1}):
        body = {"name": "A", "email": "a@example.com", "message": "hi", **bad}
        assert client.post("/v1/contact", json=body).status_code == 422, bad
    assert not sent


# ---- consent forms -------------------------------------------------------------------------------------
def test_admin_creates_link_and_prefill_is_visible(client):
    f = new_form(client, note="Sara 2 Nov", expires_in_days=3,
                 prefill={"name": "Sara Client", "pname": "ignored: the psychologist fills this in the panel"})
    assert f["state"] == "open" and f["link_active"] and len(f["token"]) >= 30
    r = client.get(f"/v1/consent/{f['token']}")
    assert r.status_code == 200
    assert r.json()["data"] == {"name": "Sara Client"}
    assert client.get(f"/v1/admin/consent-forms/{f['id']}", headers=ADMIN).json()["first_opened_at"]


def test_autosave_is_shared_with_the_next_person_who_opens_the_link(client):
    f = new_form(client)
    tok = f["token"]
    assert client.patch(f"/v1/consent/{tok}", json={"name": "Sara", "phone": "0300"}).status_code == 200
    assert client.patch(f"/v1/consent/{tok}", json={"complaint": "Panic at work", "sig_client": SIG}).status_code == 200
    # a second device opens the same link and sees everything the first person typed
    data = client.get(f"/v1/consent/{tok}").json()["data"]
    assert data == {"name": "Sara", "phone": "0300", "complaint": "Panic at work", "sig_client": SIG}
    # clearing a field is saved too
    client.patch(f"/v1/consent/{tok}", json={"sig_client": ""})
    assert client.get(f"/v1/consent/{tok}").json()["data"]["sig_client"] == ""


def test_autosave_rejects_bad_fields(client):
    tok = new_form(client)["token"]
    assert client.patch(f"/v1/consent/{tok}", json={"unknown": 1}).status_code == 422
    assert client.patch(f"/v1/consent/{tok}", json={"sig_client": "javascript:alert(1)"}).status_code == 422
    assert client.patch(f"/v1/consent/{tok}", json={"name": "x" * 500}).status_code == 422


def test_client_save_then_sign_in_panel_then_email(client, sent):
    f = new_form(client)
    tok = f["token"]
    r = client.post(f"/v1/consent/{tok}/submit", json={"name": "Sara"})
    assert r.status_code == 422 and "sig_client" in r.json()["detail"] and "sig_psych" not in r.json()["detail"]
    r = client.post(f"/v1/consent/{tok}/submit", json={**FULL, "gneed": True})
    assert r.status_code == 422 and "sig_guardian" in r.json()["detail"]

    # the client cannot fill the psychologist's part
    r = client.post(f"/v1/consent/{tok}/submit", json={**FULL, "gneed": False, "pname": "Me", "sig_psych": SIG})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "submitted" and body["reference"] is None and "pname" not in body["data"]
    assert client.patch(f"/v1/consent/{tok}", json={"name": "Changed"}).status_code == 409
    assert client.post(f"/v1/consent/{tok}/submit", json=FULL).status_code == 409
    assert client.get(f"/v1/consent/{tok}").json()["status"] == "submitted"

    # signing happens in the panel
    assert client.post(f"/v1/admin/consent-forms/{f['id']}/sign", json={"pname": "", "sig_psych": SIG},
                       headers=ADMIN).status_code == 422
    r = client.post(f"/v1/admin/consent-forms/{f['id']}/sign", json=PSYCH, headers=ADMIN)
    assert r.status_code == 200, r.text
    signed = r.json()
    assert signed["state"] == "completed" and signed["reference"].startswith("PNK-")
    assert signed["data"]["pname"] == "Mashal Zia"
    assert client.get(f"/v1/consent/{tok}").json()["status"] == "completed"

    url = f"/v1/admin/consent-forms/{f['id']}/email"
    pdf = ("consent.pdf", b"%PDF-1.4 signed", "application/pdf")
    assert client.post(url, files={"pdf": ("x.pdf", b"nope", "application/pdf")}, headers=ADMIN).status_code == 415
    r = client.post(url, files={"pdf": pdf}, headers=ADMIN)
    assert r.status_code == 200, r.text
    team, mine = sent[-2:]
    assert team.to == "team@panik.test" and signed["reference"] in team.subject
    assert mine.to == "Sara.Client@example.com" and mine.attachments[0].content.startswith(b"%PDF-")
    assert client.post(url, files={"pdf": pdf}, headers=ADMIN).status_code == 409


def test_reopen_lets_the_client_edit_again(client):
    f = new_form(client)
    client.post(f"/v1/consent/{f['token']}/submit", json=FULL)
    assert client.post(f"/v1/admin/consent-forms/{f['id']}/reopen", headers=ADMIN).json()["state"] == "open"
    assert client.patch(f"/v1/consent/{f['token']}", json={"name": "Sara K."}).status_code == 200


def test_revoked_and_expired_links_stop_opening(client):
    f = new_form(client)
    tok = f["token"]
    client.patch(f"/v1/consent/{tok}", json={"name": "Sara"})
    r = client.post(f"/v1/admin/consent-forms/{f['id']}/revoke", headers=ADMIN)
    assert r.json()["state"] == "revoked" and not r.json()["link_active"]
    for call in (client.get(f"/v1/consent/{tok}"), client.patch(f"/v1/consent/{tok}", json={"name": "x"}),
                 client.post(f"/v1/consent/{tok}/submit", json=FULL)):
        assert call.status_code == 410
    # the answers are kept for the admin
    assert client.get(f"/v1/admin/consent-forms/{f['id']}", headers=ADMIN).json()["data"]["name"] == "Sara"

    g = new_form(client)
    q("UPDATE consent_forms SET expires_at = now() - interval '1 minute' WHERE id = $1", uuid.UUID(g["id"]))
    assert client.get(f"/v1/consent/{g['token']}").status_code == 410
    expired = client.get("/v1/admin/consent-forms", params={"state": "expired"}, headers=ADMIN).json()["items"]
    assert g["id"] in [x["id"] for x in expired]
    assert client.get("/v1/consent/not-a-real-token-at-all").status_code == 404


def test_consent_admin_endpoints_need_key(client):
    assert client.get("/v1/admin/consent-forms").status_code == 401
    assert client.post("/v1/admin/consent-forms", json={}).status_code == 401
    assert client.get("/v1/admin/contact-messages").status_code == 401

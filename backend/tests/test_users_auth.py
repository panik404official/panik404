import pytest

from app import notify as notify_mod

from .conftest import ADMIN, KEY, q

SIG = "data:image/png;base64,iVBORw0KGgo="
CLIENT = {"name": "Sara Client", "dob": "1995-04-02", "phone": "0300 1234567", "email": "sara@example.com",
          "ename": "Ali", "ephone": "0300 7654321", "session_time": "2026-11-02T16:00", "ack": True,
          "sig_client": SIG}


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def mails(monkeypatch):
    sent = []

    async def fake_send(_settings, *batch):
        sent.extend(batch)

    monkeypatch.setattr(notify_mod, "send_mail", fake_send)
    return sent


@pytest.fixture()
def boss(client):
    """A fresh first admin, created through the one-time setup screen."""
    q("DELETE FROM users")
    assert client.get("/v1/auth/setup").json() == {"needs_setup": True}
    r = client.post("/v1/auth/setup", json={"admin_key": KEY, "name": "Hira Admin", "username": "Hira",
                                            "email": "Hira@Example.com", "password": "correct horse 1"})
    assert r.status_code == 201, r.text
    return r.json()


def make_user(client, boss, **over):
    body = {"name": "Dr Mashal", "username": "mashal", "email": "mashal@example.com", "password": "therapy-pass-1",
            "role": "psychologist", "qualification": "Clinical Psychologist", **over}
    r = client.post("/v1/admin/users", json=body, headers=bearer(boss["token"]))
    assert r.status_code == 201, r.text
    login = client.post("/v1/auth/login", json={"login": body["username"], "password": body["password"]})
    assert login.status_code == 200, login.text
    return r.json(), login.json()["token"]


def test_first_admin_setup_and_login(client, boss):
    assert boss["user"]["role"] == "admin" and boss["user"]["username"] == "hira"
    assert client.get("/v1/auth/setup").json() == {"needs_setup": False}
    again = {"admin_key": KEY, "name": "X", "username": "xx1", "email": "x@example.org", "password": "password12"}
    assert client.post("/v1/auth/setup", json=again).status_code == 409
    q("DELETE FROM users")
    assert client.post("/v1/auth/setup", json={**again, "admin_key": "wrong"}).status_code == 401


def test_login_logout_me_and_password(client, boss):
    for login in ("hira", "HIRA@EXAMPLE.com"):
        r = client.post("/v1/auth/login", json={"login": login, "password": "correct horse 1"})
        assert r.status_code == 200 and r.json()["user"]["email"] == "hira@example.com"
    assert client.post("/v1/auth/login", json={"login": "hira", "password": "nope"}).status_code == 401
    assert client.post("/v1/auth/login", json={"login": "ghost", "password": "nope"}).status_code == 401

    t = boss["token"]
    me = client.get("/v1/auth/me", headers=bearer(t)).json()
    assert me["name"] == "Hira Admin" and "orders" in me["permissions"]
    assert client.get("/v1/admin/overview", headers=bearer(t)).status_code == 200

    other = client.post("/v1/auth/login", json={"login": "hira", "password": "correct horse 1"}).json()["token"]
    r = client.post("/v1/auth/password", json={"current_password": "correct horse 1", "new_password": "newpass-123"},
                    headers=bearer(t))
    assert r.status_code == 200
    assert client.get("/v1/auth/me", headers=bearer(other)).status_code == 401  # other devices signed out
    assert client.get("/v1/auth/me", headers=bearer(t)).status_code == 200
    client.post("/v1/auth/logout", headers=bearer(t))
    assert client.get("/v1/admin/overview", headers=bearer(t)).status_code == 401


def test_psychologist_only_reaches_granted_sections(client, boss):
    u, t = make_user(client, boss)
    assert u["permissions"] == ["consent_assigned"]
    assert client.get("/v1/admin/orders", headers=bearer(t)).status_code == 403
    assert client.get("/v1/admin/users", headers=bearer(t)).status_code == 403
    assert client.post("/v1/admin/users", json={}, headers=bearer(t)).status_code in (403, 422)
    assert client.post("/v1/admin/consent-forms", json={}, headers=bearer(t)).status_code == 403
    assert client.get("/v1/admin/consent-forms", headers=bearer(t)).status_code == 200

    r = client.patch(f"/v1/admin/users/{u['id']}", json={"permissions": ["consent_assigned", "orders"]},
                     headers=bearer(boss["token"]))
    assert r.status_code == 200 and "orders" in r.json()["permissions"]
    assert client.get("/v1/admin/orders", headers=bearer(t)).status_code == 200
    assert client.patch(f"/v1/admin/users/{u['id']}", json={"permissions": ["made_up"]},
                        headers=bearer(boss["token"])).status_code == 422


def test_switching_off_and_last_admin_rules(client, boss):
    u, t = make_user(client, boss)
    client.patch(f"/v1/admin/users/{u['id']}", json={"is_active": False}, headers=bearer(boss["token"]))
    assert client.get("/v1/auth/me", headers=bearer(t)).status_code == 401
    r = client.post("/v1/auth/login", json={"login": "mashal", "password": "therapy-pass-1"})
    assert r.status_code == 403

    me = boss["user"]["id"]
    r = client.patch(f"/v1/admin/users/{me}", json={"role": "psychologist"}, headers=bearer(boss["token"]))
    assert r.status_code == 409
    dup = {"name": "Dup", "username": "mashal", "email": "new@example.com", "password": "password12"}
    assert client.post("/v1/admin/users", json=dup, headers=bearer(boss["token"])).status_code == 409
    # an admin can reset someone's password
    r = client.patch(f"/v1/admin/users/{u['id']}", json={"is_active": True, "password": "reset-pass-99"},
                     headers=bearer(boss["token"]))
    assert r.status_code == 200
    assert client.post("/v1/auth/login", json={"login": "mashal", "password": "reset-pass-99"}).status_code == 200


def unread(client, token):
    return client.get("/v1/admin/notifications/count", headers=bearer(token)).json()["unread"]


def test_consent_flow_notifies_admin_then_psychologist(client, boss, mails):
    psych, pt = make_user(client, boss)
    other, ot = make_user(client, boss, name="Dr Other", username="other", email="other@example.com")
    at = boss["token"]
    f = client.post("/v1/admin/consent-forms", json={}, headers=bearer(at)).json()

    # 1. the client fills the form and presses Save -> the admin is notified (bell + email)
    assert client.post(f"/v1/consent/{f['token']}/submit", json=CLIENT).status_code == 200
    assert unread(client, at) == 1
    n = client.get("/v1/admin/notifications", headers=bearer(at)).json()["items"][0]
    assert n["kind"] == "consent_submitted" and "Sara Client" in n["title"] and n["link"] == f"/admin/consent/{f['id']}"
    assert any(m.to == "hira@example.com" and "Sara Client" in m.subject for m in mails)

    # psychologists can't see unassigned forms
    assert client.get(f"/v1/admin/consent-forms/{f['id']}", headers=bearer(pt)).status_code == 404
    assert client.get("/v1/admin/consent-forms", headers=bearer(pt)).json()["items"] == []

    # 2. the admin assigns a psychologist -> they are notified
    assert client.post(f"/v1/admin/consent-forms/{f['id']}/assign", json={"user_id": boss["user"]["id"]},
                       headers=bearer(at)).status_code == 422  # only psychologists
    r = client.post(f"/v1/admin/consent-forms/{f['id']}/assign", json={"user_id": psych["id"]}, headers=bearer(at))
    assert r.status_code == 200 and r.json()["assigned_to"]["name"] == "Dr Mashal"
    assert unread(client, pt) == 1 and unread(client, ot) == 0
    assert any(m.to == "mashal@example.com" and "assigned to you" in m.subject for m in mails)
    assert client.post(f"/v1/admin/consent-forms/{f['id']}/assign", json={"user_id": psych["id"]},
                       headers=bearer(pt)).status_code == 403  # psychologists can't assign

    # 3. the psychologist sees it and signs; another psychologist can't
    items = client.get("/v1/admin/consent-forms", headers=bearer(pt)).json()["items"]
    assert [i["id"] for i in items] == [f["id"]] and items[0]["state"] == "submitted"
    sign = {"pname": "Dr Mashal", "pqual": "Clinical Psychologist", "sig_psych": SIG}
    assert client.post(f"/v1/admin/consent-forms/{f['id']}/sign", json=sign, headers=bearer(ot)).status_code == 404
    r = client.post(f"/v1/admin/consent-forms/{f['id']}/sign", json=sign, headers=bearer(pt))
    assert r.status_code == 200 and r.json()["state"] == "completed"
    assert unread(client, at) == 2  # the admin hears it was signed

    # marking read
    nid = client.get("/v1/admin/notifications", headers=bearer(pt)).json()["items"][0]["id"]
    client.post(f"/v1/admin/notifications/{nid}/read", headers=bearer(pt))
    assert unread(client, pt) == 0
    client.post("/v1/admin/notifications/read-all", headers=bearer(at))
    assert unread(client, at) == 0


def test_assign_up_front_notifies_psychologist_when_client_saves(client, boss, mails):
    psych, pt = make_user(client, boss)
    f = client.post("/v1/admin/consent-forms", json={"assign_to": psych["id"]}, headers=bearer(boss["token"])).json()
    assert f["assigned_to"]["id"] == psych["id"] and unread(client, pt) == 1
    client.post(f"/v1/consent/{f['token']}/submit", json=CLIENT)
    kinds = [n["kind"] for n in client.get("/v1/admin/notifications", headers=bearer(pt)).json()["items"]]
    assert kinds == ["consent_ready", "consent_assigned"]


def test_system_key_still_works_for_scripts(client):
    assert client.get("/v1/admin/overview", headers=ADMIN).status_code == 200
    assert client.get("/v1/admin/overview").status_code == 401

"""Google Meet sessions for consent forms, the start/end clock, feedback, and payment receipts on Cloudinary.
Google and Cloudinary are faked; nothing leaves the machine."""
import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import gmeet, notify as notify_mod
from app.repos import meetings as meetings_mod
from app.routers import intake

from .conftest import ADMIN, future_date, q
from .test_users_auth import CLIENT, SIG, bearer, boss, make_user  # noqa: F401  (boss is a fixture)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture()
def mails(monkeypatch):
    sent = []

    async def fake_send(_settings, *batch):
        sent.extend(batch)

    monkeypatch.setattr(notify_mod, "send_mail", fake_send)
    monkeypatch.setattr(meetings_mod, "send_mail", fake_send)
    monkeypatch.setattr(intake, "send_mail", fake_send)
    return sent


@pytest.fixture()
def google(monkeypatch):
    """A fake Google Calendar: records calls and hands out Meet links."""
    calls = []

    async def create_event(_s, **kw):
        calls.append(("create", kw))
        n = len([c for c in calls if c[0] == "create"])
        return gmeet.CalendarEvent(event_id=f"ev{n}", meet_url=f"https://meet.google.com/abc-defg-00{n}",
                                   html_link=None)

    async def update_event(_s, event_id, **kw):
        calls.append(("update", {"event_id": event_id, **kw}))
        return gmeet.CalendarEvent(event_id=event_id, meet_url=None, html_link=None)

    async def cancel_event(_s, event_id):
        calls.append(("cancel", {"event_id": event_id}))

    monkeypatch.setattr(gmeet, "create_event", create_event)
    monkeypatch.setattr(gmeet, "update_event", update_event)
    monkeypatch.setattr(gmeet, "cancel_event", cancel_event)
    return calls


def _saved_form(client, at, psych_id=None):
    f = client.post("/v1/admin/consent-forms", json={}, headers=bearer(at)).json()
    assert client.post(f"/v1/consent/{f['token']}/submit", json=CLIENT).status_code == 200
    if psych_id:
        r = client.post(f"/v1/admin/consent-forms/{f['id']}/assign", json={"user_id": psych_id}, headers=bearer(at))
        assert r.status_code == 200, r.text
        return r.json()
    return client.get(f"/v1/admin/consent-forms/{f['id']}", headers=bearer(at)).json()


def test_assigning_a_saved_form_creates_a_meet_link_and_emails_both(client, boss, mails, google):
    psych, pt = make_user(client, boss)
    at = boss["token"]
    f = _saved_form(client, at)
    assert f["meeting"] is None and not google  # saved but nobody assigned yet: no meeting

    f = _saved_form(client, at, psych["id"])
    m = f["meeting"]
    assert m["status"] == "scheduled" and m["meet_url"] == "https://meet.google.com/abc-defg-001"
    assert m["link_source"] == "google" and m["invited_at"] and m["psychologist"]["name"] == "Dr Mashal"
    # 16:00 Pakistan time = 11:00 UTC, one hour long
    assert m["starts_at"].startswith("2026-11-02T11:00:00") and m["minutes"] == 60
    kind, kw = google[0]
    assert kind == "create" and sorted(kw["attendees"]) == ["mashal@example.com", "sara@example.com"]

    client_mail = next(x for x in mails if x.to == "sara@example.com")
    assert "meet.google.com/abc-defg-001" in client_mail.text and "Dr Mashal" in client_mail.text
    assert "4:00 PM (Pakistan time)" in client_mail.text
    psych_mail = next(x for x in mails if x.to == "mashal@example.com" and "New session" in x.subject)
    assert "meet.google.com/abc-defg-001" in psych_mail.text

    # the psychologist sees it in their sessions; another psychologist doesn't
    other, ot = make_user(client, boss, name="Dr Other", username="other", email="other@example.com")
    mine = client.get("/v1/admin/meetings", headers=bearer(pt)).json()
    assert [x["id"] for x in mine["items"]] == [m["id"]] and mine["counts"]["upcoming"] == 1
    assert client.get("/v1/admin/meetings", headers=bearer(ot)).json()["items"] == []
    assert client.get(f"/v1/admin/meetings/{m['id']}", headers=bearer(ot)).status_code == 404

    # reassigning moves the same event to the new psychologist and emails them
    n = len(mails)
    r = client.post(f"/v1/admin/consent-forms/{f['id']}/assign", json={"user_id": other["id"]}, headers=bearer(at))
    assert r.json()["meeting"]["psychologist"]["name"] == "Dr Other"
    assert google[-1][0] == "update" and "other@example.com" in google[-1][1]["attendees"]
    assert any(x.to == "other@example.com" for x in mails[n:])

    # closing the link cancels the session and removes the calendar event
    r = client.post(f"/v1/admin/consent-forms/{f['id']}/revoke", headers=bearer(at))
    assert r.json()["meeting"]["status"] == "cancelled" and google[-1] == ("cancel", {"event_id": "ev1"})


def test_assigned_up_front_gets_the_link_when_the_client_saves(client, boss, mails, google):
    psych, pt = make_user(client, boss)
    at = boss["token"]
    f = client.post("/v1/admin/consent-forms", json={"assign_to": psych["id"]}, headers=bearer(at)).json()
    assert client.post(f"/v1/consent/{f['token']}/submit", json=CLIENT).status_code == 200
    m = client.get(f"/v1/admin/consent-forms/{f['id']}", headers=bearer(at)).json()["meeting"]
    assert m and m["meet_url"] and len([c for c in google if c[0] == "create"]) == 1
    assert any(x.to == "sara@example.com" and "Your Panik session" in x.subject for x in mails)


def test_without_google_admins_are_told_and_can_paste_a_link(client, boss, mails):
    psych, pt = make_user(client, boss)
    at = boss["token"]
    f = _saved_form(client, at, psych["id"])
    m = f["meeting"]
    assert m["meet_url"] is None and "not connected" in m["link_error"]
    kinds = [n["kind"] for n in client.get("/v1/admin/notifications", headers=bearer(at)).json()["items"]]
    assert "meeting_link_failed" in kinds
    assert client.get("/v1/admin/meetings", params={"status": "no_link"}, headers=bearer(at)).json()["items"]

    # psychologists can't edit; admins can paste a link, which is then emailed
    assert client.patch(f"/v1/admin/meetings/{m['id']}", json={"meet_url": "https://meet.google.com/x"},
                        headers=bearer(pt)).status_code == 403
    assert client.patch(f"/v1/admin/meetings/{m['id']}", json={"meet_url": "meet.google.com/x"},
                        headers=bearer(at)).status_code == 422
    r = client.patch(f"/v1/admin/meetings/{m['id']}", json={"meet_url": "https://meet.google.com/zzz-zzzz-zzz"},
                     headers=bearer(at))
    assert r.status_code == 200 and r.json()["link_source"] == "manual" and r.json()["link_error"] is None
    assert any(x.to == "sara@example.com" and "zzz-zzzz-zzz" in x.text for x in mails)

    # rescheduling sticks even if the form is reassigned later
    r = client.patch(f"/v1/admin/meetings/{m['id']}", json={"starts_at": "2026-11-05T18:30", "minutes": 45},
                     headers=bearer(at))
    assert r.json()["starts_at"].startswith("2026-11-05T13:30:00") and r.json()["minutes"] == 45
    other, _ = make_user(client, boss, name="Dr Other", username="other", email="other@example.com")
    r = client.post(f"/v1/admin/consent-forms/{f['id']}/assign", json={"user_id": other["id"]}, headers=bearer(at))
    assert r.json()["meeting"]["starts_at"].startswith("2026-11-05T13:30:00")


def _run(coro):
    async def go():
        from tortoise import Tortoise
        from app.db import tortoise_config
        from app.config import get_settings
        await Tortoise.init(config=tortoise_config(get_settings()))
        try:
            return await coro()
        finally:
            await Tortoise.close_connections()
    return asyncio.run(go())


def test_clock_starts_and_ends_sessions_and_feedback_after(client, boss, mails, google):
    psych, pt = make_user(client, boss)
    at = boss["token"]
    m = _saved_form(client, at, psych["id"])["meeting"]
    mid = uuid.UUID(m["id"])

    assert client.post(f"/v1/admin/meetings/{m['id']}/feedback", json={"feedback": "early"},
                       headers=bearer(pt)).status_code == 409  # not ended yet

    # move it into the past: the clock marks it live, then ended
    now = datetime.now(timezone.utc)
    q("UPDATE meetings SET starts_at = $1, ends_at = $2 WHERE id = $3", now - timedelta(minutes=5),
      now + timedelta(minutes=55), mid)
    from app.config import get_settings
    _run(lambda: meetings_mod.tick(get_settings()))
    got = client.get(f"/v1/admin/meetings/{m['id']}", headers=bearer(pt)).json()
    assert got["status"] == "live" and got["started_how"] == "auto"

    q("UPDATE meetings SET ends_at = $1 WHERE id = $2", now - timedelta(minutes=1), mid)
    ended = _run(lambda: meetings_mod.tick(get_settings()))
    assert [r["id"] for r in ended] == [mid]
    _run(lambda: meetings_mod.after_tick(get_settings(), ended))
    got = client.get(f"/v1/admin/meetings/{m['id']}", headers=bearer(pt)).json()
    assert got["status"] == "ended" and got["ended_how"] == "auto"
    kinds = [n["kind"] for n in client.get("/v1/admin/notifications", headers=bearer(pt)).json()["items"]]
    assert "meeting_ended" in kinds

    assert client.get("/v1/admin/meetings", params={"status": "needs_feedback"},
                      headers=bearer(pt)).json()["counts"]["needs_feedback"] == 1
    r = client.post(f"/v1/admin/meetings/{m['id']}/feedback", json={"feedback": "Went well. Follow up in 2 weeks."},
                    headers=bearer(pt))
    assert r.status_code == 200 and r.json()["feedback"].startswith("Went well") and r.json()["feedback_by"]["name"] == "Dr Mashal"
    assert any(n["kind"] == "meeting_feedback"
               for n in client.get("/v1/admin/notifications", headers=bearer(at)).json()["items"])


def test_psychologist_can_start_and_end_by_hand(client, boss, mails, google):
    psych, pt = make_user(client, boss)
    m = _saved_form(client, boss["token"], psych["id"])["meeting"]
    r = client.post(f"/v1/admin/meetings/{m['id']}/start", headers=bearer(pt))
    assert r.status_code == 200 and r.json()["status"] == "live" and r.json()["started_how"] == "manual"
    r = client.post(f"/v1/admin/meetings/{m['id']}/end", headers=bearer(pt))
    assert r.json()["status"] == "ended" and r.json()["ended_how"] == "manual"
    assert client.post(f"/v1/admin/meetings/{m['id']}/start", headers=bearer(pt)).status_code == 409
    # the clock leaves finished sessions alone
    from app.config import get_settings
    assert _run(lambda: meetings_mod.tick(get_settings())) == []


# ---- receipts --------------------------------------------------------------------------------------
def _booking(client, ids):
    r = client.post("/v1/orders", json={**ids, "kind": "booking", "preferred_date": future_date(),
                                        "preferred_time": "4:05 PM",
                                        "customer": {"name": "Sara", "email": "sara@example.com", "phone": "0300"}},
                    headers={"Idempotency-Key": str(uuid.uuid4())})
    assert r.status_code == 201, r.text
    return r.json()


BOOKING = {"age": 27, "role": "Student", "concern": ["Anxiety"], "desc": "x", "duration": "1-4 weeks",
           "distress": 6, "danger": "No", "suicidal": "No", "harm": "No", "medical": "No", "treatment": "None",
           "notes": "Evenings", "consent": True}


def test_receipt_is_stored_on_cloudinary_and_shown_signed(client, ids, mails, monkeypatch):
    from app import cloud
    uploads = []

    async def fake_upload(_s, content, mime, public_id):
        uploads.append((mime, public_id, len(content)))
        return {"provider": "cloudinary", "public_id": f"panik/receipts/{public_id}", "resource_type": "image",
                "type": "authenticated", "format": "png", "version": 1700000000}

    monkeypatch.setattr(cloud, "upload_receipt", fake_upload)
    monkeypatch.setenv("CLOUDINARY_URL", "cloudinary://123456:secret-abc@demo-cloud")
    from app.config import get_settings
    get_settings.cache_clear()
    try:
        o = _booking(client, ids)
        r = client.post("/v1/bookings/request", data={"data": json.dumps({"order_id": o["id"], **BOOKING})},
                        files={"receipt": ("pay.png", PNG, "image/png")})
        assert r.status_code == 200, r.text
        assert uploads == [("image/png", f"order-{o['order_no']}", len(PNG))]
        d = client.get(f"/v1/admin/orders/{o['id']}", headers=ADMIN).json()
        rec = d["receipt"]
        assert rec["stored"] and not rec["is_pdf"]
        assert rec["url"].startswith("https://res.cloudinary.com/demo-cloud/image/authenticated/s--")
        assert "c_limit,q_auto,w_480" in rec["thumb_url"]
        rows = client.get("/v1/admin/orders", params={"group": "sessions"}, headers=ADMIN).json()["items"]
        assert all(x["kind"] == "booking" for x in rows) and rows[0]["receipt"] == "stored"
        assert all(x["kind"] in ("product", "gift") for x in
                   client.get("/v1/admin/orders", params={"group": "shop"}, headers=ADMIN).json()["items"])
    finally:
        monkeypatch.delenv("CLOUDINARY_URL")
        get_settings.cache_clear()


def test_receipt_upload_failure_never_blocks_the_booking(client, ids, mails):
    o = _booking(client, ids)  # Cloudinary isn't configured in tests
    r = client.post("/v1/bookings/request", data={"data": json.dumps({"order_id": o["id"], **BOOKING})},
                    files={"receipt": ("pay.png", PNG, "image/png")})
    assert r.status_code == 200
    rec = client.get(f"/v1/admin/orders/{o['id']}", headers=ADMIN).json()["receipt"]
    assert rec["stored"] is False and rec["url"] is None and "not configured" in rec["store_error"]
    assert any(a.mime == "image/png" for m in mails for a in m.attachments)  # still emailed to the team

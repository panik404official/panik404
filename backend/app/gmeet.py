"""Google Meet links through the Google Calendar API, on the Panik Google account's calendar.

Each session is a calendar event with a Meet conference attached and the client + psychologist as guests.
Auth is OAuth with a long-lived refresh token for that one account (scripts/google_auth.py gets it once);
the short-lived access token is cached in memory and refreshed when it runs out.

Only the scope https://www.googleapis.com/auth/calendar.events is needed.
"""
import asyncio
import logging
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote

import httpx

from .config import Settings

log = logging.getLogger("gmeet")
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/calendar/v3"
TIMEOUT = httpx.Timeout(20.0)


class GoogleNotConfigured(Exception):
    pass


class GoogleError(Exception):
    pass


@dataclass
class CalendarEvent:
    event_id: str
    meet_url: str | None
    html_link: str | None


_token: dict[str, float | str] = {"value": "", "expires": 0.0}
_lock = asyncio.Lock()


def _detail(r: httpx.Response) -> str:
    try:
        j = r.json()
        err = j.get("error")
        if isinstance(err, dict):
            return f"{r.status_code} {err.get('message') or err.get('status')}"
        return f"{r.status_code} {j.get('error_description') or err or r.text[:200]}"
    except ValueError:
        return f"{r.status_code} {r.text[:200]}"


async def _access_token(s: Settings) -> str:
    if not s.google_ready:
        raise GoogleNotConfigured("Google Meet is not connected (GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN).")
    async with _lock:
        if _token["value"] and float(_token["expires"]) - 60 > time.time():
            return str(_token["value"])
        async with httpx.AsyncClient(timeout=TIMEOUT) as c:
            r = await c.post(TOKEN_URL, data={
                "client_id": s.google_client_id, "client_secret": s.google_client_secret,
                "refresh_token": s.google_refresh_token, "grant_type": "refresh_token"})
        if r.status_code != 200:
            # invalid_grant = the refresh token was revoked or expired (apps left in "Testing" lose it after 7 days)
            raise GoogleError(f"Google sign-in failed: {_detail(r)}")
        j = r.json()
        _token.update(value=j["access_token"], expires=time.time() + float(j.get("expires_in", 3600)))
        return str(_token["value"])


async def _call(s: Settings, method: str, path: str, *, params: dict | None = None, json: dict | None = None,
                ok: tuple[int, ...] = (200,)) -> dict:
    token = await _access_token(s)
    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
        r = await c.request(method, f"{API}{path}", params=params, json=json,
                            headers={"Authorization": f"Bearer {token}"})
    if r.status_code == 401:  # token revoked mid-way: force a refresh next time
        _token.update(value="", expires=0.0)
    if r.status_code not in ok:
        raise GoogleError(f"Google Calendar: {_detail(r)}")
    return r.json() if r.content else {}


def _cal(s: Settings) -> str:
    return quote(s.google_calendar_id, safe="")


def _meet_url(ev: dict) -> str | None:
    for ep in (ev.get("conferenceData") or {}).get("entryPoints", []):
        if ep.get("entryPointType") == "video":
            return ep.get("uri")
    return ev.get("hangoutLink")


def _attendees(emails: list[str]) -> list[dict]:
    seen, out = set(), []
    for e in emails:
        if e and e.lower() not in seen:
            seen.add(e.lower())
            out.append({"email": e})
    return out


def _updates(s: Settings) -> str:
    return "all" if s.google_send_invites else "none"


async def create_event(s: Settings, *, summary: str, description: str, start: datetime, end: datetime,
                       attendees: list[str], request_id: str | None = None) -> CalendarEvent:
    body = {
        "summary": summary, "description": description,
        "start": {"dateTime": start.isoformat(), "timeZone": s.session_timezone},
        "end": {"dateTime": end.isoformat(), "timeZone": s.session_timezone},
        "attendees": _attendees(attendees),
        "guestsCanInviteOthers": False, "guestsCanSeeOtherGuests": False,
        "reminders": {"useDefault": False, "overrides": [{"method": "email", "minutes": 60},
                                                         {"method": "popup", "minutes": 10}]},
        "conferenceData": {"createRequest": {"requestId": request_id or uuid.uuid4().hex,
                                             "conferenceSolutionKey": {"type": "hangoutsMeet"}}},
    }
    ev = await _call(s, "POST", f"/calendars/{_cal(s)}/events", json=body,
                     params={"conferenceDataVersion": 1, "sendUpdates": _updates(s)})
    url = _meet_url(ev)
    if not url:
        # The conference is usually ready at once; occasionally Google reports it "pending" for a moment.
        for _ in range(3):
            await asyncio.sleep(1.5)
            ev = await _call(s, "GET", f"/calendars/{_cal(s)}/events/{quote(ev['id'], safe='')}")
            url = _meet_url(ev)
            if url:
                break
    return CalendarEvent(event_id=ev["id"], meet_url=url, html_link=ev.get("htmlLink"))


async def update_event(s: Settings, event_id: str, *, start: datetime | None = None, end: datetime | None = None,
                       attendees: list[str] | None = None, summary: str | None = None,
                       description: str | None = None) -> CalendarEvent:
    body: dict = {}
    if start and end:
        body["start"] = {"dateTime": start.isoformat(), "timeZone": s.session_timezone}
        body["end"] = {"dateTime": end.isoformat(), "timeZone": s.session_timezone}
    if attendees is not None:
        body["attendees"] = _attendees(attendees)
    if summary:
        body["summary"] = summary
    if description:
        body["description"] = description
    ev = await _call(s, "PATCH", f"/calendars/{_cal(s)}/events/{quote(event_id, safe='')}", json=body,
                     params={"conferenceDataVersion": 1, "sendUpdates": _updates(s)})
    return CalendarEvent(event_id=ev["id"], meet_url=_meet_url(ev), html_link=ev.get("htmlLink"))


async def cancel_event(s: Settings, event_id: str) -> None:
    await _call(s, "DELETE", f"/calendars/{_cal(s)}/events/{quote(event_id, safe='')}",
                params={"sendUpdates": _updates(s)}, ok=(200, 204, 404, 410))

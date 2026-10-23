"""Online sessions (Google Meet) for consent forms.

A meeting is set up as soon as both are true: the client has saved the consent form, and an admin has chosen the
psychologist (whichever happens last). The session time comes from the form. A Google Calendar event with a Meet
link is created on the Panik calendar, with the client and the psychologist as guests, and both get the link by
email (the psychologist also gets a panel notification).

Changing the psychologist or the time updates the same event and emails the new details; closing the form's link
cancels it. If Google isn't connected or fails, the meeting is still recorded with the error, admins are told, and
they can retry or paste a link by hand.

Status moves on its own: scheduled -> live at the start time -> ended at the end time (tick() below runs every
few seconds). The psychologist can also press Start / End, and add feedback once it has ended.
"""
import logging
import smtplib
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from fastapi import BackgroundTasks
from tortoise import connections
from tortoise.exceptions import IntegrityError
from tortoise.expressions import Q

from .. import gmeet
from ..config import Settings, get_settings
from ..mailer import Mail, MailNotConfigured, send_mail
from ..models import ConsentForm, Meeting, User
from ..notify import notify, users_who_can
from .consent import EMAIL_RE

log = logging.getLogger("meetings")
SYNC_CLAIM = timedelta(minutes=2)
ACTIVE = ("scheduled", "live")
STATUSES = ("scheduled", "live", "ended", "cancelled")


class MeetingError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code, self.message = status_code, message


def now() -> datetime:
    return datetime.now(timezone.utc)


def session_window(s: Settings, session_time: str | None, minutes: int | None = None) -> tuple[datetime, datetime] | None:
    """The form's "2026-11-02T15:00" (entered in Pakistan time) as an aware start and end."""
    if not session_time:
        return None
    try:
        start = datetime.fromisoformat(str(session_time).strip())
    except ValueError:
        return None
    if start.tzinfo is None:
        start = start.replace(tzinfo=ZoneInfo(s.session_timezone))
    return start, start + timedelta(minutes=minutes or s.session_minutes)


def nice_time(s: Settings, at: datetime) -> str:
    local = at.astimezone(ZoneInfo(s.session_timezone))
    zone = "Pakistan time" if s.session_timezone == "Asia/Karachi" else s.session_timezone
    return local.strftime("%A, %d %B %Y at %I:%M %p").replace(" 0", " ") + f" ({zone})"


def row(m: Meeting | None, full: bool = True) -> dict[str, Any] | None:
    if m is None:
        return None
    psych = m.psychologist if m.psychologist_id and isinstance(getattr(m, "psychologist", None), User) else None
    out = {
        "id": str(m.id), "consent_form_id": str(m.consent_form_id), "status": m.status,
        "client_name": m.client_name, "client_email": m.client_email,
        "starts_at": m.starts_at, "ends_at": m.ends_at, "minutes": int((m.ends_at - m.starts_at).total_seconds() // 60),
        "time_set_by_admin": m.time_set_by_admin,
        "meet_url": m.meet_url, "link_source": m.link_source, "link_error": m.link_error,
        "has_calendar_event": bool(m.calendar_event_id), "invited_at": m.invited_at,
        "started_at": m.started_at, "started_how": m.started_how, "ended_at": m.ended_at, "ended_how": m.ended_how,
        "cancelled_at": m.cancelled_at, "has_feedback": bool(m.feedback), "feedback_at": m.feedback_at,
        "psychologist": {"id": str(psych.id), "name": psych.name, "email": psych.email} if psych else
        ({"id": str(m.psychologist_id)} if m.psychologist_id else None),
        "created_at": m.created_at, "updated_at": m.updated_at,
    }
    if full:
        fb = m.feedback_by if m.feedback_by_id and isinstance(getattr(m, "feedback_by", None), User) else None
        out["feedback"] = m.feedback
        out["feedback_by"] = {"id": str(fb.id), "name": fb.name} if fb else None
    return out


async def get(meeting_id: UUID) -> Meeting | None:
    return await Meeting.filter(id=meeting_id).select_related("psychologist", "feedback_by").first()


async def for_form(form_id: UUID) -> Meeting | None:
    return await Meeting.filter(consent_form_id=form_id).select_related("psychologist", "feedback_by").first()


async def for_forms(form_ids: list) -> dict[str, dict]:
    if not form_ids:
        return {}
    ms = await Meeting.filter(consent_form_id__in=form_ids).select_related("psychologist")
    return {str(m.consent_form_id): row(m, full=False) for m in ms}


# ---- emails ------------------------------------------------------------------------------------------
async def _send_quietly(s: Settings, mails: list[Mail]) -> None:
    try:
        await send_mail(s, *mails)
    except MailNotConfigured:
        log.info("meeting email skipped: mail is not configured")
    except (smtplib.SMTPException, OSError) as e:
        log.error("meeting email failed: %s", e)


def _summary(m: Meeting) -> str:
    return f"Panik session: {m.client_name or 'client'}"


def _description(s: Settings, m: Meeting, psych: User | None) -> str:
    return "\n".join([
        "Your online Panik session.",
        f"Psychologist: {psych.name if psych else 'to be confirmed'}",
        "Join with the Google Meet link on this invitation a couple of minutes early.",
        "If you need to reschedule, reply to the Panik email at least 12 hours before the session.",
    ])


async def send_invites(s: Settings, background: BackgroundTasks | None, m: Meeting, psych: User | None,
                       reason: str = "new") -> None:
    """Emails the link to the client and notifies + emails the psychologist."""
    if not m.meet_url:
        return
    when = nice_time(s, m.starts_at)
    minutes = int((m.ends_at - m.starts_at).total_seconds() // 60)
    lead = {"new": "Your Panik session is booked.", "time": "The time of your Panik session has changed.",
            "psych": "Your Panik session has a new psychologist.", "resend": "Here are your Panik session details.",
            "link": "Your Panik session has a new meeting link."}.get(reason, "Your Panik session details.")
    if m.client_email and EMAIL_RE.match(m.client_email):
        mail = Mail(to=m.client_email, subject=f"Your Panik session: {when}", text="\n".join([
            f"Hello {m.client_name or 'there'},", "", lead, "",
            f"When: {when} ({minutes} minutes)",
            f"Psychologist: {psych.name if psych else 'to be confirmed'}",
            f"Google Meet link: {m.meet_url}", "",
            "Join a couple of minutes early from a quiet, private place, with your camera and microphone working.",
            "Please sign in to Google with this email address if you can, so you're let in straight away.", "",
            "If you need to reschedule, reply to this email at least 12 hours before the session.",
            "If you are in immediate danger, contact local emergency services now.",
        ]))
        if background is not None:
            background.add_task(_send_quietly, s, [mail])
        else:
            await _send_quietly(s, [mail])
    if psych:
        title = {"new": f"New session with {m.client_name or 'a client'}",
                 "time": f"Session time changed: {m.client_name or 'client'}",
                 "link": f"New Meet link: {m.client_name or 'client'}"}.get(reason, f"Session with {m.client_name or 'a client'}")
        await notify(s, background, [psych], kind="meeting_scheduled", title=title,
                     body=f"Session with {m.client_name or 'the client'} on {when} ({minutes} minutes).\n"
                          f"Google Meet link: {m.meet_url}",
                     link=f"/admin/sessions/{m.id}")
    m.invited_at = now()
    await Meeting.filter(id=m.id).update(invited_at=m.invited_at)


async def _tell_admins_no_link(s: Settings, background: BackgroundTasks | None, m: Meeting) -> None:
    await notify(s, background, await users_who_can("consent_manage"), kind="meeting_link_failed",
                 title=f"No Meet link for {m.client_name or 'a session'}",
                 body=f"The Google Meet link for the session on {nice_time(s, m.starts_at)} could not be created: "
                      f"{m.link_error}. Open the session to retry or paste a link.",
                 link=f"/admin/sessions/{m.id}")


# ---- scheduling ------------------------------------------------------------------------------------------
async def _claim(m: Meeting) -> bool:
    t = now()
    n = await Meeting.filter(Q(id=m.id) & (Q(syncing_at__isnull=True) | Q(syncing_at__lt=t - SYNC_CLAIM))
                             ).update(syncing_at=t)
    return n == 1


async def _drop_event(s: Settings, m: Meeting) -> None:
    if not m.calendar_event_id:
        return
    try:
        await gmeet.cancel_event(s, m.calendar_event_id)
    except (gmeet.GoogleNotConfigured, gmeet.GoogleError, httpx.HTTPError) as e:
        log.warning("could not delete calendar event %s: %s", m.calendar_event_id, e)
    m.calendar_event_id = None


async def _google_sync(s: Settings, m: Meeting, psych: User | None, *, new_link: bool, changed: bool) -> bool:
    """Creates or updates the calendar event. Returns True if a new Meet link was made."""
    attendees = [e for e in (m.client_email, psych.email if psych else None) if e]
    try:
        if new_link:
            if m.calendar_event_id:
                await _drop_event(s, m)
            ev = await gmeet.create_event(s, summary=_summary(m), description=_description(s, m, psych),
                                          start=m.starts_at, end=m.ends_at, attendees=attendees,
                                          request_id=f"pnk{m.id.hex}{int(now().timestamp())}")
            m.calendar_event_id, m.meet_url, m.link_source = ev.event_id, ev.meet_url, "google"
            m.link_error = None if ev.meet_url else "Google created the event but no Meet link (check the account)."
            return bool(ev.meet_url)
        if changed and m.calendar_event_id:
            await gmeet.update_event(s, m.calendar_event_id, start=m.starts_at, end=m.ends_at, attendees=attendees,
                                     summary=_summary(m), description=_description(s, m, psych))
            m.link_error = None
    except gmeet.GoogleNotConfigured as e:
        m.link_error = str(e)
    except (gmeet.GoogleError, httpx.HTTPError) as e:
        log.error("Google Meet sync failed for meeting %s: %s", m.id, e)
        m.link_error = (str(e) or e.__class__.__name__)[:500]
    return False


async def sync_for_form(s: Settings, background: BackgroundTasks | None, form_id: UUID) -> Meeting | None:
    """Brings the form's meeting in line with the form: creates it (and the Meet link) once the form is saved and
    assigned, follows a new psychologist or time, cancels it when the link is closed or the form unassigned.
    Never raises for Google or email problems; those are stored on the meeting and shown in the panel."""
    form = await ConsentForm.filter(id=form_id).select_related("assigned_to").first()
    if form is None:
        return None
    m = await for_form(form_id)
    psych = form.assigned_to if form.assigned_to_id else None
    ready = form.status in ("submitted", "completed") and psych is not None

    if not ready:
        if m and m.status == "scheduled" and (form.status == "revoked" or psych is None):
            await cancel(s, background, m, why="the consent form was closed" if form.status == "revoked"
                         else "the psychologist was removed")
        return m

    d = form.data or {}
    window = session_window(s, d.get("session_time"))
    if window is None and not (m and m.time_set_by_admin):
        log.warning("consent form %s has no usable session time (%r)", form.id, d.get("session_time"))
        return m

    reason = "new"
    if m is None:
        start, end = window  # type: ignore[misc]
        try:
            m = await Meeting.create(consent_form_id=form.id, psychologist_id=psych.id, client_name=d.get("name"),
                                     client_email=d.get("email"), starts_at=start, ends_at=end)
        except IntegrityError:  # created a moment ago by a parallel request
            return await for_form(form_id)
        new_link, changed = True, False
    else:
        if m.status in ("live", "ended"):
            return m  # the session has happened; leave it alone
        revive = m.status == "cancelled"
        changes = []
        if m.psychologist_id != psych.id:
            changes.append("psych")
        if window and not m.time_set_by_admin and (m.starts_at != window[0] or m.ends_at != window[1]):
            changes.append("time")
            m.starts_at, m.ends_at = window
        m.psychologist_id, m.client_name, m.client_email = psych.id, d.get("name"), d.get("email")
        if revive:
            m.status, m.cancelled_at, m.calendar_event_id = "scheduled", None, None
            if m.link_source == "google":
                m.meet_url = None
        new_link = m.link_source != "manual" and not m.calendar_event_id
        changed = bool(changes)
        reason = "new" if (revive or not m.invited_at) else ("psych" if "psych" in changes else "time")
        await m.save()
        if not new_link and not changed:
            return m

    if not await _claim(m):
        return m  # a parallel request is talking to Google for this meeting right now
    try:
        made = await _google_sync(s, m, psych, new_link=new_link, changed=changed)
    finally:
        m.syncing_at = None
        await m.save()
    m = await for_form(form_id)
    if made or (changed and m.meet_url) or (reason == "new" and m.meet_url and not m.invited_at):
        await send_invites(s, background, m, psych, reason)
    elif not m.meet_url:
        await _tell_admins_no_link(s, background, m)
    return m


async def sync_later(s: Settings, form_id: UUID) -> None:
    """For BackgroundTasks: runs sync_for_form after the response, with its own background queue for emails."""
    bg = BackgroundTasks()
    try:
        await sync_for_form(s, bg, form_id)
        await bg()
    except Exception:  # noqa: BLE001 - a background job must only log
        log.exception("meeting sync failed for consent form %s", form_id)


async def sync_now(s: Settings, background: BackgroundTasks | None, form_id: UUID) -> Meeting | None:
    """Inline version for admin actions: never fails the request it runs in."""
    try:
        return await sync_for_form(s, background, form_id)
    except Exception:  # noqa: BLE001
        log.exception("meeting sync failed for consent form %s", form_id)
        return await for_form(form_id)


async def cancel(s: Settings, background: BackgroundTasks | None, m: Meeting, why: str) -> Meeting:
    if m.status not in ACTIVE:
        return m
    await _drop_event(s, m)
    m.status, m.cancelled_at = "cancelled", now()
    await m.save(update_fields=["status", "cancelled_at", "calendar_event_id", "updated_at"])
    if m.psychologist_id:
        psych = await User.get_or_none(id=m.psychologist_id)
        await notify(s, background, [psych] if psych else [], kind="meeting_cancelled",
                     title=f"Session cancelled: {m.client_name or 'client'}",
                     body=f"The session on {nice_time(s, m.starts_at)} was cancelled because {why}.",
                     link=f"/admin/sessions/{m.id}", email=True)
    return m


async def regenerate(s: Settings, background: BackgroundTasks | None, m: Meeting) -> Meeting:
    """Admin pressed "Create a new Meet link" (after an error, or to replace a manual link)."""
    if m.status not in ACTIVE:
        raise MeetingError(409, "Only an upcoming or live session can get a new link.")
    psych = await User.get_or_none(id=m.psychologist_id) if m.psychologist_id else None
    if not await _claim(m):
        raise MeetingError(409, "A link is being created right now. Reload in a moment.")
    try:
        made = await _google_sync(s, m, psych, new_link=True, changed=False)
    finally:
        m.syncing_at = None
        await m.save()
    if not made:
        raise MeetingError(502, m.link_error or "Google didn't return a Meet link.")
    await send_invites(s, background, m, psych, "link")
    return await get(m.id)


async def edit(s: Settings, background: BackgroundTasks | None, m: Meeting, *, meet_url: str | None,
               starts_at: datetime | None, minutes: int | None, notify_people: bool) -> Meeting:
    """Admin changes: paste a link by hand, or reschedule."""
    if m.status not in ACTIVE:
        raise MeetingError(409, "This session has already ended or was cancelled.")
    psych = await User.get_or_none(id=m.psychologist_id) if m.psychologist_id else None
    reason = None
    if meet_url is not None:
        url = meet_url.strip()
        if not url.startswith("https://"):
            raise MeetingError(422, "Paste the full meeting link, starting with https://")
        if url != m.meet_url:
            await _drop_event(s, m)  # the Google event's link would now be wrong
            m.meet_url, m.link_source, m.link_error = url, "manual", None
            reason = "link"
    if starts_at is not None or minutes is not None:
        start = starts_at or m.starts_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=ZoneInfo(s.session_timezone))
        length = minutes or int((m.ends_at - m.starts_at).total_seconds() // 60)
        if (start, start + timedelta(minutes=length)) != (m.starts_at, m.ends_at):
            m.starts_at, m.ends_at, m.time_set_by_admin = start, start + timedelta(minutes=length), True
            reason = reason or "time"
            if m.status == "live" and m.starts_at > now():
                m.status, m.started_at, m.started_how = "scheduled", None, None
    if reason is None:
        return m
    await m.save()
    if m.calendar_event_id and reason == "time":
        if await _claim(m):
            try:
                await _google_sync(s, m, psych, new_link=False, changed=True)
            finally:
                m.syncing_at = None
                await m.save()
    if notify_people:
        await send_invites(s, background, m, psych, reason)
    return await get(m.id)


# ---- live / ended / feedback ------------------------------------------------------------------------------
async def start(m: Meeting) -> Meeting:
    if m.status == "live":
        return m
    if m.status != "scheduled":
        raise MeetingError(409, "This session can't be started (it has ended or was cancelled).")
    t = now()
    m.status, m.started_at, m.started_how = "live", t, "manual"
    # Started late: keep the full length before it ends on its own.
    if m.ends_at - t < (m.ends_at - m.starts_at):
        m.ends_at = t + (m.ends_at - m.starts_at)
    await m.save(update_fields=["status", "started_at", "started_how", "ends_at", "updated_at"])
    return m


async def end(m: Meeting) -> Meeting:
    if m.status == "ended":
        return m
    if m.status not in ACTIVE:
        raise MeetingError(409, "A cancelled session can't be ended.")
    m.status, m.ended_at, m.ended_how = "ended", now(), "manual"
    await m.save(update_fields=["status", "ended_at", "ended_how", "updated_at"])
    return m


async def save_feedback(m: Meeting, by: UUID | None, text: str) -> Meeting:
    if m.status != "ended":
        raise MeetingError(409, "Feedback can be added once the session has ended.")
    text = text.strip()
    if not text:
        raise MeetingError(422, "Write some feedback first.")
    m.feedback, m.feedback_at, m.feedback_by_id = text, now(), by
    await m.save(update_fields=["feedback", "feedback_at", "feedback_by_id", "updated_at"])
    return await get(m.id)


async def tick(s: Settings) -> list[dict]:
    """Moves sessions along by the clock: scheduled -> live at the start, live -> ended at the end.
    Safe to run on several servers at once (each row moves once). Returns the sessions that just ended."""
    conn = connections.get("default")
    await conn.execute_query(
        """UPDATE meetings SET status = 'live', started_at = starts_at, started_how = 'auto', updated_at = now()
           WHERE status = 'scheduled' AND starts_at <= now()""")
    return await conn.execute_query_dict(
        """UPDATE meetings SET status = 'ended', ended_at = ends_at, ended_how = 'auto', updated_at = now()
           WHERE status = 'live' AND ends_at <= now()
           RETURNING id, psychologist_id, client_name, feedback""")


async def after_tick(s: Settings, ended: list[dict]) -> None:
    for r in ended:
        if r["psychologist_id"] and not r["feedback"]:
            psych = await User.get_or_none(id=r["psychologist_id"])
            await notify(s, None, [psych] if psych else [], kind="meeting_ended",
                         title=f"Session ended: {r['client_name'] or 'client'}",
                         body="The session has ended. Add your feedback while it's fresh.",
                         link=f"/admin/sessions/{r['id']}", email=False)


# ---- listing ---------------------------------------------------------------------------------------------
async def list_meetings(status: str | None, when: str | None, q: str | None, limit: int,
                        only_for: UUID | None) -> list[dict]:
    qs = Meeting.all().select_related("psychologist")
    if only_for:
        qs = qs.filter(psychologist_id=only_for)
    if status == "needs_feedback":
        qs = qs.filter(status="ended", feedback__isnull=True)
    elif status == "no_link":
        qs = qs.filter(status__in=ACTIVE, meet_url__isnull=True)
    elif status in STATUSES:
        qs = qs.filter(status=status)
    t = now()
    if when == "upcoming":
        qs = qs.filter(ends_at__gte=t, status__in=ACTIVE).order_by("starts_at")
    elif when == "past":
        qs = qs.filter(Q(ends_at__lt=t) | Q(status__in=["ended", "cancelled"])).order_by("-starts_at")
    elif when == "today":
        day = t.astimezone(ZoneInfo(get_settings().session_timezone)).replace(hour=0, minute=0, second=0, microsecond=0)
        qs = qs.filter(starts_at__gte=day, starts_at__lt=day + timedelta(days=1)).order_by("starts_at")
    else:
        qs = qs.order_by("-starts_at")
    if q and q.strip():
        term = q.strip()
        qs = qs.filter(Q(client_name__icontains=term) | Q(client_email__icontains=term)
                       | Q(psychologist__name__icontains=term))
    return [row(m, full=False) for m in await qs.limit(limit)]


async def counts(only_for: UUID | None) -> dict[str, int]:
    base = Meeting.filter(psychologist_id=only_for) if only_for else Meeting.all()
    t = now()
    return {
        "upcoming": await base.filter(status__in=ACTIVE, ends_at__gte=t).count(),
        "live": await base.filter(status="live").count(),
        "needs_feedback": await base.filter(status="ended", feedback__isnull=True).count(),
        "no_link": await base.filter(status__in=ACTIVE, meet_url__isnull=True).count(),
    }

"""In-panel notifications (the bell) with an email copy sent in the background.

The notification row is written before the response, so it's never lost; the email is best effort and a mail
failure only logs (it must not undo a client's saved consent form, for example).
"""
import logging
import smtplib
from collections.abc import Iterable

from fastapi import BackgroundTasks
from tortoise.expressions import Q

from .config import Settings
from .mailer import Mail, MailNotConfigured, send_mail
from .models import Notification, User

log = logging.getLogger("notify")


async def users_who_can(perm: str) -> list[User]:
    """Active admins plus anyone granted `perm`."""
    users = await User.filter(Q(role="admin") | Q(permissions__contains=[perm]), is_active=True)
    return users


async def _email(settings: Settings, mails: list[Mail]) -> None:
    if not mails:
        return
    try:
        await send_mail(settings, *mails)
    except MailNotConfigured:
        log.info("notification emails skipped: mail is not configured")
    except (smtplib.SMTPException, OSError) as e:
        log.error("notification email failed: %s", e)


async def notify(settings: Settings, background: BackgroundTasks | None, users: Iterable[User], *, kind: str,
                 title: str, body: str, link: str | None = None, email: bool = True) -> int:
    seen, targets = set(), []
    for u in users:
        if u and u.id not in seen and u.is_active:
            seen.add(u.id)
            targets.append(u)
    if not targets:
        return 0
    await Notification.bulk_create([Notification(user_id=u.id, kind=kind, title=title, body=body, link=link)
                                    for u in targets])
    if email and background is not None:
        url = f"{settings.panel_url.rstrip('/')}{link.removeprefix('/admin')}" if settings.panel_url and link else None
        mails = [Mail(to=u.email, subject=f"Panik: {title}",
                      text="\n".join([f"Hello {u.name},", "", body, "",
                                      f"Open it in the Panik panel: {url}" if url else
                                      "Sign in to the Panik panel to see it.", ""]))
                 for u in targets]
        background.add_task(_email, settings, mails)
    return len(targets)

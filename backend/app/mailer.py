"""Outgoing email over SMTP (Gmail app password). smtplib is blocking, so sends run in a worker thread."""
import asyncio
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr

from .config import Settings


class MailNotConfigured(Exception):
    pass


@dataclass
class Attachment:
    filename: str
    content: bytes
    mime: str  # "type/subtype"


@dataclass
class Mail:
    to: str
    subject: str
    text: str
    reply_to: str | None = None
    attachments: list[Attachment] = field(default_factory=list)


def _build(s: Settings, mail: Mail) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr(("Panik404", s.mail_from or s.mail_username or ""))
    msg["To"] = mail.to
    msg["Subject"] = " ".join(mail.subject.split())  # user-supplied names must not inject header lines
    if mail.reply_to:
        msg["Reply-To"] = mail.reply_to
    msg.set_content(mail.text)
    for a in mail.attachments:
        maintype, _, subtype = a.mime.partition("/")
        msg.add_attachment(a.content, maintype=maintype, subtype=subtype or "octet-stream", filename=a.filename)
    return msg


def _send_all(s: Settings, mails: list[Mail]) -> None:
    password = (s.mail_password or "").replace(" ", "")  # Google shows app passwords in groups of four
    implicit_tls = s.mail_tls and s.mail_port == 465
    ctx = ssl.create_default_context()
    smtp_cls = smtplib.SMTP_SSL if implicit_tls else smtplib.SMTP
    kwargs = {"context": ctx} if implicit_tls else {}
    with smtp_cls(s.mail_server, s.mail_port, timeout=20, **kwargs) as smtp:
        if s.mail_tls and not implicit_tls:
            smtp.starttls(context=ctx)
        smtp.login(s.mail_username or "", password)
        for m in mails:
            smtp.send_message(_build(s, m))


async def send_mail(s: Settings, *mails: Mail) -> None:
    """Sends every message over one SMTP connection. Raises MailNotConfigured or smtplib/OSError."""
    if not (s.mail_username and s.mail_password):
        raise MailNotConfigured("SMTP credentials are not configured")
    await asyncio.to_thread(_send_all, s, list(mails))

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "production"

    neon_db_url: str
    neon_db_url_direct: str | None = None

    admin_api_key: str = Field(min_length=16)
    ip_hash_secret: str = Field(min_length=16)

    cors_origins: str = "http://localhost:5173"
    trust_proxy: bool = True

    db_pool_min: int = 1
    db_pool_max: int = 10

    track_queue_size: int = 20_000
    track_flush_interval: float = 1.0
    track_flush_batch: int = 500

    rate_limit_track_per_min: int = 120
    rate_limit_orders_per_min: int = 20
    rate_limit_intake_per_15min: int = 5  # gift / booking request emails
    rate_limit_contact_per_15min: int = 5
    rate_limit_consent_per_min: int = 240  # consent forms autosave while people type
    rate_limit_login_per_15min: int = 10

    # Outgoing mail (Gmail SMTP with an app password). Requests that send email fail with 503 until set.
    admin_email: str = "ethancarter.signmakerz@gmail.com"
    contact_email: str | None = None  # Contact us messages go here (defaults to admin_email)
    consent_email: str | None = None  # signed consent forms go here (defaults to admin_email)
    # Address of the admin panel, used for links in notification emails, e.g. https://example.com/#/admin
    panel_url: str | None = None
    session_hours: int = 12  # how long a sign-in lasts
    session_remember_days: int = 30  # with "keep me signed in"
    mail_username: str | None = None
    mail_password: str | None = None
    mail_from: str | None = None
    mail_server: str = "smtp.gmail.com"
    mail_port: int = 587
    mail_tls: bool = True
    receipt_max_bytes: int = 5 * 1024 * 1024

    # Cloudinary: where payment receipts are stored so the panel can show them. Either the three values,
    # or CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name> (Cloudinary dashboard -> API Keys).
    cloudinary_url: str | None = None
    cloudinary_cloud_name: str | None = None
    cloudinary_api_key: str | None = None
    cloudinary_api_secret: str | None = None
    cloudinary_folder: str = "panik/receipts"

    # Google Calendar / Meet: a Meet link is created on the Panik Google account's calendar for every session.
    # Get the refresh token once with:  python scripts/google_auth.py   (see README, "Google Meet").
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_refresh_token: str | None = None
    google_calendar_id: str = "primary"
    google_send_invites: bool = True  # Google also emails calendar invitations to the client and psychologist
    session_minutes: int = 60  # length of a session (Meet event and automatic "ended")
    session_timezone: str = "Asia/Karachi"  # the consent form's session time is entered in this zone
    meeting_tick_seconds: int = 30  # how often scheduled sessions are moved to live / ended

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def cloudinary_creds(self) -> tuple[str, str, str] | None:
        """(cloud_name, api_key, api_secret) or None when receipt storage isn't set up."""
        name, key, secret = self.cloudinary_cloud_name, self.cloudinary_api_key, self.cloudinary_api_secret
        if self.cloudinary_url and self.cloudinary_url.startswith("cloudinary://"):
            from urllib.parse import urlsplit
            u = urlsplit(self.cloudinary_url)
            name, key, secret = u.hostname or name, u.username or key, u.password or secret
        return (name, key, secret) if name and key and secret else None

    @property
    def google_ready(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.google_refresh_token)

    @property
    def migration_url(self) -> str:
        return self.neon_db_url_direct or self.neon_db_url


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

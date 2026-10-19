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

    # Outgoing mail (Gmail SMTP with an app password). Requests that send email fail with 503 until set.
    admin_email: str = "ethancarter.signmakerz@gmail.com"
    mail_username: str | None = None
    mail_password: str | None = None
    mail_from: str | None = None
    mail_server: str = "smtp.gmail.com"
    mail_port: int = 587
    mail_tls: bool = True
    receipt_max_bytes: int = 5 * 1024 * 1024

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def migration_url(self) -> str:
        return self.neon_db_url_direct or self.neon_db_url


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]

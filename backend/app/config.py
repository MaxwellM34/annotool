from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    session_secret: str

    google_client_id: str = ""
    google_client_secret: str = ""
    oauth_redirect_uri: str = "http://localhost:8000/auth/google/callback"

    allowed_emails: str = ""
    admin_email: str = ""

    frontend_url: str = "http://localhost:5173"

    push_token: str = ""

    default_hourly_rate_cents: int = 2500
    currency_code: str = "CAD"
    currency_symbol: str = "CA$"

    # Time-tracking
    idle_threshold_seconds: int = 30

    # Storage guard — Neon free tier is 0.5 GB = 536870912 bytes.
    # When pg_database_size hits storage_lock_percent of this, the app refuses
    # new uploads + writes and the frontend shows a "storage full" page.
    storage_limit_bytes: int = 536_870_912  # 0.5 GB
    storage_lock_percent: int = 90  # lock at 90 %

    @property
    def allowed_emails_set(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_emails.split(",") if e.strip()}

    @property
    def is_admin_email(self):
        norm = (self.admin_email or "").strip().lower()
        def check(email: str) -> bool:
            return email.strip().lower() == norm
        return check


settings = Settings()

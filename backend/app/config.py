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

    # Time-tracking
    idle_threshold_seconds: int = 30

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

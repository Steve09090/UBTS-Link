"""Runtime configuration, read from environment variables."""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # SQLite by default; set e.g. postgresql+psycopg://user:pass@host/ubts for the central DB.
    database_url: str = os.getenv("UBTS_DATABASE_URL", "sqlite:///./ubts_link.db")
    # Days ahead at which a unit counts as "expiring soon".
    expiry_warning_days: int = int(os.getenv("UBTS_EXPIRY_WARNING_DAYS", "7"))
    # Background sweep (expiry alerts + automatic requisitions). 0 disables it.
    sweep_interval_seconds: int = int(os.getenv("UBTS_SWEEP_INTERVAL_SECONDS", "3600"))
    # Optional webhook that receives every notification as JSON (e.g. a hub's ordering system).
    webhook_url: str | None = os.getenv("UBTS_WEBHOOK_URL") or None


settings = Settings()

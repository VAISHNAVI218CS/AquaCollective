import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000")
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


class Settings:
    app_name: str = "AquaCollective"
    environment: str = os.getenv("ENVIRONMENT", "development")
    secret_key: str = os.getenv("SECRET_KEY", "local-development-key-change-before-deploying")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./aquacollective.db")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    cors_origins: list[str] = _origins()


settings = Settings()

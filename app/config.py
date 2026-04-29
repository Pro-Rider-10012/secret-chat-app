import os
from pathlib import Path


def _to_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    APP_NAME = "Secret"
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/secret"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    BASE_DIR = Path(__file__).resolve().parent.parent
    INSTANCE_DIR = BASE_DIR / "instance"
    UPLOAD_TMP_DIR = Path(os.getenv("UPLOAD_TMP_DIR", INSTANCE_DIR / "uploads" / "tmp"))
    LOCAL_MEDIA_DIR = Path(os.getenv("LOCAL_MEDIA_DIR", INSTANCE_DIR / "media"))

    MESSAGE_TTL_HOURS = int(os.getenv("MESSAGE_TTL_HOURS", "24"))
    ENABLE_SCHEDULER = _to_bool(os.getenv("ENABLE_SCHEDULER", "true"))

    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET")
    AWS_S3_REGION = os.getenv("AWS_S3_REGION", "us-east-1")
    AWS_S3_ENDPOINT_URL = os.getenv("AWS_S3_ENDPOINT_URL")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _to_bool(os.getenv("SESSION_COOKIE_SECURE"))

    MAX_CHUNK_SIZE = int(os.getenv("MAX_CHUNK_SIZE", str(5 * 1024 * 1024)))
    STALE_UPLOAD_TTL_HOURS = int(os.getenv("STALE_UPLOAD_TTL_HOURS", "6"))

    @classmethod
    def ensure_dirs(cls) -> None:
        cls.UPLOAD_TMP_DIR.mkdir(parents=True, exist_ok=True)
        cls.LOCAL_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

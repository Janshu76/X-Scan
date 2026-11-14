from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_local_env() -> None:
    """Read simple KEY=value lines without displaying their values."""
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        value = line.strip()
        if not value or value.startswith("#") or "=" not in value:
            continue
        key, raw = value.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = raw.strip().strip("\"'")


load_local_env()
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DEFAULT_DB_PATH = ROOT / "backend" / "data" / "terrawatch.sqlite3"
DATA_ROOT = Path(os.getenv("TERRAWATCH_DATA_ROOT", ROOT / "data"))
EARTHDATA_TOKEN = os.getenv("EARTHDATA_TOKEN", "")


def database_backend() -> tuple[str, str | None]:
    if DATABASE_URL.startswith(("postgresql://", "postgres://", "postgresql+psycopg://")):
        try:
            import psycopg  # noqa: F401
        except ImportError:
            return "sqlite", "PostgreSQL URL configured, but psycopg is unavailable; using the SQLite development fallback."
        return "postgresql", None
    return "sqlite", None

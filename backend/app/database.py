from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from backend.app import settings

DB_PATH = settings.DEFAULT_DB_PATH
if settings.DATABASE_URL.startswith("sqlite:///"):
    configured_path = Path(settings.DATABASE_URL[len("sqlite:///"):])
    DB_PATH = configured_path if configured_path.is_absolute() else settings.ROOT / configured_path
MIGRATION_DIR = Path(__file__).resolve().parents[1] / "migrations"
BACKEND, FALLBACK_REASON = settings.database_backend()


def new_id() -> str:
    return str(uuid4())


class Connection:
    def __init__(self, raw: Any, backend: str):
        self.raw = raw
        self.backend = backend

    def execute(self, sql: str, params: tuple[Any, ...] = ()):
        if self.backend == "postgresql":
            return self.raw.execute(sql.replace("?", "%s"), params)
        return self.raw.execute(sql, params)

    def commit(self) -> None:
        self.raw.commit()

    def rollback(self) -> None:
        self.raw.rollback()

    def close(self) -> None:
        self.raw.close()


def connect(path: Path | None = None) -> Connection:
    global BACKEND, FALLBACK_REASON
    if BACKEND == "postgresql":
        import psycopg
        from psycopg.rows import dict_row
        try:
            url = settings.DATABASE_URL.replace("postgresql+psycopg://", "postgresql://", 1)
            return Connection(psycopg.connect(url, row_factory=dict_row), "postgresql")
        except Exception:
            BACKEND = "sqlite"
            FALLBACK_REASON = "PostgreSQL connection failed; using the SQLite development fallback."
    chosen = path or DB_PATH
    chosen.parent.mkdir(parents=True, exist_ok=True)
    raw = sqlite3.connect(chosen, timeout=20, check_same_thread=False)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys = ON")
    raw.execute("PRAGMA journal_mode = WAL")
    return Connection(raw, "sqlite")


def _run_script(conn: Connection, sql: str) -> None:
    for statement in (part.strip() for part in sql.split(";")):
        if statement:
            conn.execute(statement)


def initialize_database(path: Path | None = None) -> None:
    global BACKEND, FALLBACK_REASON
    conn = connect(path)
    try:
        if BACKEND == "postgresql":
            conn.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
        for migration in sorted(MIGRATION_DIR.glob("*.sql")):
            name = migration.name
            if conn.execute("SELECT 1 FROM schema_migrations WHERE version = ?", (name,)).fetchone():
                continue
            _run_script(conn, migration.read_text(encoding="utf-8"))
            from datetime import datetime, timezone
            conn.execute("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)", (name, datetime.now(timezone.utc).isoformat()))
        conn.commit()
    except Exception:
        conn.rollback()
        if BACKEND == "postgresql":
            BACKEND = "sqlite"
            FALLBACK_REASON = "PostgreSQL initialization failed; using the SQLite development fallback."
            return initialize_database(path)
        raise
    finally:
        conn.close()


@contextmanager
def get_connection() -> Iterator[Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

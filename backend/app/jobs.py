from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from backend.app.database import get_connection, new_id

SECRET_KEY_PARTS = {"password", "passwd", "token", "secret", "authorization", "credential", "api_key", "access_key"}
SECRET_VALUE = re.compile(r"(?:\bBearer\s+|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}|\bEDL[A-Za-z0-9_-]{32,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,})", re.IGNORECASE)


def _assert_no_credentials(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if any(part in str(key).lower() for part in SECRET_KEY_PARTS):
                raise ValueError("credential_fields_not_allowed")
            _assert_no_credentials(child)
    elif isinstance(value, list):
        for child in value:
            _assert_no_credentials(child)
    elif isinstance(value, str) and SECRET_VALUE.search(value):
        raise ValueError("credential_values_not_allowed")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def enqueue(job_type: str, payload: dict[str, Any]) -> str:
    _assert_no_credentials(payload)
    job_id = new_id()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO jobs(id, job_type, status, payload_json, created_at) VALUES (?, ?, 'queued', ?, ?)",
            (job_id, job_type, json.dumps(payload, separators=(",", ":")), utc_now()),
        )
    return job_id


def list_jobs(limit: int = 50) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    return [dict(row) for row in rows]


def get_job(job_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None

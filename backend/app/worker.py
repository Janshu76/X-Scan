from __future__ import annotations

import argparse
import json
import time

from backend.app.database import BACKEND, get_connection, initialize_database
from backend.app.jobs import utc_now


def claim_one() -> dict | None:
    with get_connection() as conn:
        if BACKEND == "sqlite":
            conn.execute("BEGIN IMMEDIATE")
        lock_clause = " FOR UPDATE SKIP LOCKED" if BACKEND == "postgresql" else ""
        row = conn.execute(f"SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1{lock_clause}").fetchone()
        if not row:
            return None
        job = dict(row)
        conn.execute("UPDATE jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'", (utc_now(), job["id"]))
    return job


def process_one() -> bool:
    job = claim_one()
    if not job:
        return False
    try:
        if job["job_type"] == "noop":
            result = {"accepted": True, "note": "Worker queue is operational."}
        else:
            raise ValueError("unsupported_job_type")
        with get_connection() as conn:
            conn.execute("UPDATE jobs SET status='succeeded', result_json=?, finished_at=? WHERE id=?", (json.dumps(result), utc_now(), job["id"]))
    except Exception as exc:
        code = str(exc) if str(exc).isidentifier() else "job_failed"
        with get_connection() as conn:
            conn.execute("UPDATE jobs SET status='failed', error_code=?, finished_at=? WHERE id=?", (code, utc_now(), job["id"]))
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="TerraWatch database-backed job worker")
    parser.add_argument("--poll-seconds", type=float, default=1.0)
    args = parser.parse_args()
    initialize_database()
    print("TerraWatch worker started; credentials and payload secrets are never logged.")
    while True:
        if not process_one():
            time.sleep(max(0.1, args.poll_seconds))


if __name__ == "__main__":
    main()

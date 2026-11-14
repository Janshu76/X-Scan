from __future__ import annotations

import argparse
import json
import time
import json

from backend.app.database import BACKEND, get_connection, initialize_database
from backend.app.jobs import utc_now
from backend.app.acquisition.asf import DownloadManager, selected_products


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
        elif job["job_type"] == "asf_download":
            payload = json.loads(job["payload_json"])
            with get_connection() as conn:
                search = conn.execute("SELECT criteria_json FROM search_results WHERE id = ? AND provider = 'ASF DAAC'", (payload["search_id"],)).fetchone()
                if not search or json.loads(search["criteria_json"]).get("region_id") != payload["region_id"]:
                    raise ValueError("search_region_mismatch")
                products = selected_products(payload["search_id"], payload["product_ids"], conn)
            results = []
            manager = DownloadManager()
            for product in products:
                def report(progress: dict) -> None:
                    with get_connection() as conn:
                        conn.execute("UPDATE jobs SET result_json=? WHERE id=?", (json.dumps({"progress": progress}), job["id"]))
                results.append(manager.download(region_id=payload["region_id"], product=product, progress=report))
            result = {"products": results}
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

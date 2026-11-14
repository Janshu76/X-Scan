from __future__ import annotations

from contextlib import asynccontextmanager
import json
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app import database
from backend.app.jobs import enqueue, get_job, list_jobs


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.initialize_database()
    yield


app = FastAPI(title="TerraWatch API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:3000", "http://localhost:3000", "http://127.0.0.1:4173"], allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


class JobRequest(BaseModel):
    job_type: str = Field(min_length=1, max_length=80)
    payload: dict[str, Any] = Field(default_factory=dict)


@app.get("/api/health")
def health() -> dict[str, str | None]:
    try:
        with database.get_connection() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"status": "ok", "database": database.BACKEND, "fallback_reason": database.FALLBACK_REASON}
    except Exception:
        return {"status": "degraded", "database": database.BACKEND, "fallback_reason": "Database connection failed; details withheld."}


def _rows(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with database.get_connection() as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def _decode_fields(rows: list[dict[str, Any]], names: tuple[str, ...]) -> list[dict[str, Any]]:
    for row in rows:
        for name in names:
            if row.get(name):
                try:
                    row[name.removesuffix("_json")] = json.loads(row[name])
                except (TypeError, ValueError):
                    row[name.removesuffix("_json")] = []
                del row[name]
    return rows


@app.get("/api/regions")
def regions() -> list[dict[str, Any]]:
    rows = _rows("SELECT * FROM regions ORDER BY id")
    for row in rows:
        row["aoi"] = row.pop("aoi_json")
    return rows


@app.get("/api/datasets")
def datasets(region_id: str | None = None) -> list[dict[str, Any]]:
    rows = _rows("SELECT * FROM datasets WHERE region_id = ? ORDER BY name" if region_id else "SELECT * FROM datasets ORDER BY region_id, name", (region_id,) if region_id else ())
    rows = _decode_fields(rows, ("dates_json",))
    for row in rows:
        row["files"] = _rows("SELECT * FROM dataset_files WHERE dataset_id = ? ORDER BY path", (row["id"],))
    return rows


@app.get("/api/findings")
def findings(region_id: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM findings WHERE region_id = ? ORDER BY id" if region_id else "SELECT * FROM findings ORDER BY region_id, id"
    rows = _rows(sql, (region_id,) if region_id else ())
    return _decode_fields(rows, ("dataset_ids_json", "processing_run_ids_json", "limitations_json"))


@app.get("/api/manifest")
def manifest(region_id: str | None = None) -> list[dict[str, Any]]:
    return _rows("SELECT * FROM manifest_entries WHERE region_id = ? ORDER BY dataset_name, file_path" if region_id else "SELECT * FROM manifest_entries ORDER BY region_id, dataset_name, file_path", (region_id,) if region_id else ())


@app.get("/api/processing-runs")
def processing_runs(region_id: str | None = None) -> list[dict[str, Any]]:
    return _rows("SELECT * FROM processing_runs WHERE region_id = ? ORDER BY script_name" if region_id else "SELECT * FROM processing_runs ORDER BY region_id, script_name", (region_id,) if region_id else ())


@app.get("/api/search-results")
def search_results(region_id: str | None = None) -> list[dict[str, Any]]:
    rows = _rows("SELECT * FROM search_results WHERE region_id = ? ORDER BY searched_at DESC" if region_id else "SELECT * FROM search_results ORDER BY searched_at DESC", (region_id,) if region_id else ())
    return _decode_fields(rows, ("criteria_json", "summary_json"))


@app.get("/api/jobs")
def jobs(limit: int = 50) -> list[dict[str, Any]]:
    return list_jobs(max(1, min(limit, 100)))


@app.post("/api/jobs", status_code=202)
def create_job(request: JobRequest) -> dict[str, str]:
    try:
        job_id = enqueue(request.job_type, request.payload)
    except ValueError:
        raise HTTPException(status_code=422, detail="Credential fields or credential-like values are not accepted in job payloads.") from None
    return {"id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
def job(job_id: str) -> dict[str, Any]:
    found = get_job(job_id)
    if found is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return found

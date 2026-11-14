from __future__ import annotations

from contextlib import asynccontextmanager
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

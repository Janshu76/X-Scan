from fastapi.testclient import TestClient

from backend.app import database
from backend.app.main import app
from backend.app.worker import process_one


def test_health_and_database_job_queue(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.sqlite3")
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["database"] == "sqlite"
        created = client.post("/api/jobs", json={"job_type": "noop", "payload": {"source": "test"}})
        assert created.status_code == 202
        job_id = created.json()["id"]
        assert client.get(f"/api/jobs/{job_id}").json()["status"] == "queued"
        assert process_one() is True
        completed = client.get(f"/api/jobs/{job_id}").json()
        assert completed["status"] == "succeeded"
        assert client.get("/api/jobs?limit=101").status_code == 200
        rejected = client.post("/api/jobs", json={"job_type": "noop", "payload": {"access_token": "placeholder"}})
        assert rejected.status_code == 422

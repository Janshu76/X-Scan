import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import database
from backend.app.findings import build_mexico_findings
from backend.app.main import app
from backend.app.seed import PACK_SUMMARY, GNSS_PATH, seed


def test_findings_read_real_summary_values():
    summary = json.loads(PACK_SUMMARY.read_text(encoding="utf-8"))
    comparison = json.loads(GNSS_PATH.read_text(encoding="utf-8"))
    findings = build_mexico_findings(summary, comparison)
    measured = next(item for item in findings if item["id"] == "mexico-adjusted-velocity-distribution")
    assert f"{summary['velocity_cm_per_year']['p2']:.2f}" in measured["public_statement"]
    assert "LOS" in measured["public_statement"]
    gnss = next(item for item in findings if item["id"] == "mexico-gnss-adjustment-check")
    assert str(len(comparison["stations"])) in gnss["public_statement"]
    assert "not validation" in gnss["uncertainty"]
    assert all(item["evidence_label"] in {"Observed", "Measured", "Contextual", "Possible explanation", "Simulated", "Unavailable"} for item in findings)


def test_seed_registers_catalog_manifest_runs_and_shared_findings(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", Path(tmp_path) / "catalog.sqlite3")
    counts = seed()
    assert counts["datasets"] >= 7
    assert counts["findings"] >= 7
    with TestClient(app) as client:
        regions = client.get("/api/regions").json()
        findings = client.get("/api/findings?region_id=mexico_city").json()
        datasets = client.get("/api/datasets?region_id=mexico_city").json()
        manifest = client.get("/api/manifest?region_id=mexico_city").json()
        runs = client.get("/api/processing-runs?region_id=mexico_city").json()
        assert {row["id"] for row in regions} == {"mexico_city", "assam", "antarctica"}
        assert any(row["id"] == "mexico-adjusted-velocity-distribution" for row in findings)
        assert any(row["id"] == "mexico-city-opera-adjusted" for row in datasets)
        assert manifest and runs
        assert {row["script_name"] for row in runs} >= {"20_clip_all.py", "22_build_subsidence_pack.py", "24_adjust_pack_to_stable_ground.py"}

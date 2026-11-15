import json
from pathlib import Path
from io import BytesIO

from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile

from backend.app import database
from backend.app.findings import build_mexico_findings
from backend.app.main import app
from backend.app.seed import PACK_SUMMARY, GNSS_PATH, seed
from backend.app.file_registration import RegistrationError, inspect_file, register_upload


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


def test_geojson_metadata_and_format_validation(tmp_path):
    geojson = tmp_path / "sample.geojson"
    geojson.write_text(json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [94.1, 26.9]}, "properties": {}}]}), encoding="utf-8")
    crs, bounds = inspect_file(geojson, ".geojson")
    assert crs == "OGC:CRS84 (RFC 7946)"
    assert bounds == [94.1, 26.9, 94.1, 26.9]
    invalid = tmp_path / "broken.geojson"
    invalid.write_text("not json", encoding="utf-8")
    try:
        inspect_file(invalid, ".geojson")
    except RegistrationError as exc:
        assert exc.code == "invalid_geojson"
    else:
        raise AssertionError("invalid GeoJSON was accepted")


def test_registration_preserves_upload_and_rejects_duplicate(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", Path(tmp_path) / "register.sqlite3")
    monkeypatch.setattr("backend.app.file_registration.DATA_ROOT", Path(tmp_path) / "data")
    payload = json.dumps({"type": "Point", "coordinates": [94.1, 26.9]}).encode()
    args = {"region_id": "assam", "source": "user supplied", "license_name": "user supplied", "acquired": "2026-01-01"}

    async def upload(filename):
        return UploadFile(filename=filename, file=BytesIO(payload))

    import asyncio
    registered = asyncio.run(register_upload(**args, upload=asyncio.run(upload("draft.geojson"))))
    target = Path(tmp_path) / "data" / "raw" / "assam" / Path(registered["path"]).name
    assert target.read_bytes() == payload
    assert registered["crs"] == "OGC:CRS84 (RFC 7946)"
    try:
        asyncio.run(register_upload(**args, upload=asyncio.run(upload("second.geojson"))))
    except RegistrationError as exc:
        assert exc.code == "duplicate_file"
        assert exc.status_code == 409
    else:
        raise AssertionError("duplicate content was accepted")


def test_region_aois_are_closed_draft_polygons():
    for region_id in ("assam", "antarctica"):
        feature = json.loads((Path(__file__).parents[2] / "data" / "regions" / region_id / "aoi_draft.geojson").read_text(encoding="utf-8"))
        ring = feature["geometry"]["coordinates"][0]
        assert feature["properties"]["status"] == "draft, not approved"
        assert feature["geometry"]["type"] == "Polygon"
        assert ring[0] == ring[-1]

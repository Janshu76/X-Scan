from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.app.database import get_connection, initialize_database, new_id
from backend.app.findings import build_mexico_findings
from backend.app.settings import ROOT

CATALOG_PATH = ROOT / "data" / "catalog" / "datasets.json"
PACK_SUMMARY = ROOT / "data" / "mexico_city" / "subsidence_adjusted" / "summary.json"
GNSS_PATH = ROOT / "data" / "mexico_city" / "context" / "gnss_vs_insar_v2.json"
MANIFEST_PATH = ROOT / "data" / "mexico_city" / "context" / "manifest.csv"


def read_json(path: Path, fallback: Any = None) -> Any:
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else fallback


def _insert(conn, table: str, values: dict[str, Any], conflict: str = "id") -> None:
    columns = ", ".join(values)
    placeholders = ", ".join("?" for _ in values)
    updates = ", ".join(f"{column}=excluded.{column}" for column in values if column != conflict)
    conn.execute(f"INSERT INTO {table} ({columns}) VALUES ({placeholders}) ON CONFLICT({conflict}) DO UPDATE SET {updates}", tuple(values.values()))


def _files_for_path(repo_path: str) -> list[Path]:
    candidate = ROOT / repo_path
    pattern = repo_path.replace("YYYYMMDD", "[0-9]" * 8).replace("\\", "/")
    if "*" in pattern or "[" in pattern:
        return sorted(ROOT.glob(pattern))
    if candidate.is_dir():
        return sorted(file for file in candidate.rglob("*") if file.is_file())
    return [candidate] if candidate.is_file() else []


def build_snapshot() -> dict[str, Any]:
    catalog = read_json(CATALOG_PATH, {"datasets": []})
    summary = read_json(PACK_SUMMARY, {})
    comparison = read_json(GNSS_PATH, {})
    dataset_rows = catalog["datasets"]
    for dataset in dataset_rows:
        inventory = []
        for declared in dataset.get("repository_files", []):
            paths = _files_for_path(declared)
            if not paths:
                inventory.append({"path": declared, "status": "missing", "size_bytes": None, "appearance": "Unavailable"})
            for file_path in paths:
                inventory.append({
                    "path": file_path.relative_to(ROOT).as_posix(), "status": "downloaded",
                    "size_bytes": file_path.stat().st_size,
                    "appearance": "Mexico Time Machine" if "subsidence" in file_path.as_posix() else "Catalog/context panel",
                })
        dataset["files"] = inventory
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "datasets": catalog["datasets"],
        "findings": build_mexico_findings(summary, comparison) if summary else [],
    }


def seed() -> dict[str, int]:
    initialize_database()
    snapshot = build_snapshot()
    catalog = snapshot["datasets"]
    with get_connection() as conn:
        region_rows = [
            ("mexico_city", "Mexico City", "available", "data/mexico_city/aoi.geojson", "approved", "Adjusted OPERA LOS sample is available."),
            ("assam", "Majuli–Jorhat, Assam", "planned", "data/regions/assam/aoi_draft.geojson", "draft_not_approved", "No observations loaded."),
            ("antarctica", "Pine Island Glacier", "planned", "data/regions/antarctica/aoi_draft.geojson", "draft_not_approved", "No observations loaded."),
        ]
        for region_id, name, status, aoi, aoi_status, notes in region_rows:
            _insert(conn, "regions", {"id": region_id, "name": name, "status": status, "aoi_json": aoi, "aoi_status": aoi_status, "notes": notes})
        for dataset in catalog:
            region_id = dataset.get("region", "mexico_city")
            _insert(conn, "datasets", {
                "id": dataset["id"], "region_id": region_id, "name": dataset.get("name", "unknown"),
                "provider": dataset.get("provider", "unknown"), "product": dataset.get("product", "unknown"),
                "dates_json": json.dumps(dataset.get("dates", "unknown")), "resolution": str(dataset.get("spatial_resolution", "unknown")),
                "license": dataset.get("license", "unknown"), "processing": dataset.get("processing", "unknown"),
                "status": dataset.get("status", "downloaded"),
            })
            for declared in dataset.get("repository_files", []):
                paths = _files_for_path(declared)
                if "*" not in declared and not (ROOT / declared).is_dir() and not paths:
                    paths = [ROOT / declared]
                for file_path in paths or [ROOT / declared]:
                    relative = file_path.relative_to(ROOT).as_posix()
                    exists = file_path.is_file()
                    file_id = f"{dataset['id']}::{relative}"
                    _insert(conn, "dataset_files", {
                        "id": file_id, "dataset_id": dataset["id"], "path": relative,
                        "status": "downloaded" if exists else "missing",
                        "size_bytes": str(file_path.stat().st_size if exists else "unknown"),
                        "appearance": "Mexico Time Machine" if "subsidence" in relative else "Catalog/context panel",
                    })
        if MANIFEST_PATH.is_file():
            with MANIFEST_PATH.open(encoding="utf-8-sig", newline="") as stream:
                for row in csv.DictReader(stream):
                    dataset_name = row.get("name") or "unknown"
                    file_path = row.get("file") or "unknown"
                    entry_id = f"source-manifest::{file_path}"
                    _insert(conn, "manifest_entries", {
                        "id": entry_id, "region_id": "mexico_city", "dataset_name": dataset_name,
                        "source": row.get("source") or "unknown", "product_id": "unknown",
                        "acquisition_date": row.get("published_or_acquired") or "unknown",
                        "downloaded_on": row.get("downloaded_on") or "unknown",
                        "product_type": row.get("product_type") or "unknown", "resolution": row.get("resolution") or "unknown",
                        "crs": "unknown", "license": row.get("licence") or "unknown", "processing_level": "unknown",
                        "file_path": file_path, "quality_notes": "Imported from local source manifest; unprovided fields recorded as unknown.",
                    })
        for script_id, script_name, input_id, output_id, note in [
            ("mexico-city-script-20", "20_clip_all.py", "mexico-city-opera-source", "mexico-city-disp-s1-clips", "Clipped nine DISP-S1 files; original and intermediate files remain outside Git."),
            ("mexico-city-script-22", "22_build_subsidence_pack.py", "mexico-city-disp-s1-clips", "mexico-city-opera-unadjusted-provenance", "Re-referenced blocks to the common reference window, chained them, and fitted velocity."),
            ("mexico-city-script-24", "24_adjust_pack_to_stable_ground.py", "mexico-city-opera-unadjusted-provenance", "mexico-city-opera-adjusted", "Displayed pack subtracts scene-most-common velocity under an unproven stable-ground/uniform-offset assumption."),
        ]:
            _insert(conn, "processing_runs", {
                "id": script_id, "region_id": "mexico_city", "script_name": script_name,
                "input_dataset_id": input_id, "output_dataset_id": output_id,
                "started_at": "unknown", "status": "completed per supplied pack/provenance",
                "notes": note,
            })
        granule_summary = read_json(ROOT / "data" / "mexico_city" / "nisar" / "granules_summary.json", {})
        if granule_summary:
            _insert(conn, "search_results", {
                "id": "nisar-local-search-summary", "region_id": "mexico_city", "provider": "NASA ASF DAAC",
                "searched_at": "unknown", "criteria_json": json.dumps({"source_file": "raw/nisar_granules.csv"}),
                "summary_json": json.dumps(granule_summary), "status": "local summary; not a live search",
            })
        for finding in snapshot["findings"]:
            _insert(conn, "findings", {
                "id": finding["id"], "region_id": finding["region_id"], "evidence_label": finding["evidence_label"],
                "public_statement": finding["public_statement"], "research_statement": finding["research_statement"],
                "dataset_ids_json": json.dumps(finding["dataset_ids"]), "processing_run_ids_json": json.dumps(finding["processing_run_ids"]),
                "limitations_json": json.dumps(finding["limitations"]), "uncertainty": finding["uncertainty"],
            })
    manifest_count = 0
    if MANIFEST_PATH.is_file():
        with MANIFEST_PATH.open(encoding="utf-8-sig", newline="") as stream:
            manifest_count = sum(1 for _ in csv.DictReader(stream))
    return {"datasets": len(catalog), "findings": len(snapshot["findings"]), "manifest_entries": manifest_count}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed TerraWatch's local data catalog")
    parser.add_argument("--export", type=Path, help="Write the shared static view snapshot to this JSON file")
    args = parser.parse_args()
    counts = seed()
    if args.export:
        args.export.parent.mkdir(parents=True, exist_ok=True)
        args.export.write_text(json.dumps(build_snapshot(), indent=2) + "\n", encoding="utf-8")
    print(json.dumps(counts))

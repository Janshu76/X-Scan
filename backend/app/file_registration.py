from __future__ import annotations

import csv
import hashlib
import json
import re
import struct
import sqlite3
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from backend.app.database import get_connection, initialize_database, new_id
from backend.app.settings import DATA_ROOT

ALLOWED_SUFFIXES = {".tif", ".tiff", ".geojson", ".gpkg", ".zip", ".nc", ".csv"}
REGION_IDS = {"mexico_city", "assam", "antarctica"}
CHUNK_SIZE = 1024 * 1024


class RegistrationError(ValueError):
    def __init__(self, code: str, status_code: int = 422):
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def _safe_name(filename: str) -> str:
    name = Path(filename.replace("\\", "/")).name
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    if not name or name in {".", ".."}:
        raise RegistrationError("invalid_filename")
    return name[:180]


def _coordinate_bounds(value) -> list[float] | None:
    points: list[tuple[float, float]] = []
    def walk(node):
        if isinstance(node, dict):
            for key in ("coordinates", "geometry", "features", "geometries"):
                if key in node:
                    walk(node[key])
        elif isinstance(node, (list, tuple)) and len(node) >= 2 and all(isinstance(item, (int, float)) for item in node[:2]):
            points.append((float(node[0]), float(node[1])))
        elif isinstance(node, (list, tuple)):
            for child in node:
                walk(child)
    walk(value)
    if not points:
        return None
    return [min(point[0] for point in points), min(point[1] for point in points), max(point[0] for point in points), max(point[1] for point in points)]


def inspect_file(path: Path, suffix: str) -> tuple[str, list[float] | None]:
    suffix = suffix.lower()
    if suffix in {".geojson", ".json"}:
        try:
            document = json.loads(path.read_text(encoding="utf-8-sig"))
        except (UnicodeError, json.JSONDecodeError):
            raise RegistrationError("invalid_geojson") from None
        if document.get("type") not in {"FeatureCollection", "Feature", "Polygon", "MultiPolygon", "Point", "LineString", "MultiLineString", "MultiPoint", "GeometryCollection"}:
            raise RegistrationError("unsupported_geojson_structure")
        crs = "unknown"
        crs_info = document.get("crs", {}).get("properties", {}).get("name") if isinstance(document.get("crs"), dict) else None
        if crs_info:
            crs = str(crs_info)
        elif document.get("type") in {"FeatureCollection", "Feature", "Polygon", "MultiPolygon", "Point", "LineString", "MultiLineString", "MultiPoint"}:
            crs = "OGC:CRS84 (RFC 7946)"
        bounds = _coordinate_bounds(document.get("features", document.get("geometry", document.get("coordinates", document))))
        return crs, bounds
    if suffix in {".tif", ".tiff"}:
        try:
            import rasterio
            with rasterio.open(path) as raster:
                if raster.count < 1:
                    raise RegistrationError("empty_raster")
                bounds = raster.bounds
                return (raster.crs.to_string() if raster.crs else "unknown"), [bounds.left, bounds.bottom, bounds.right, bounds.top]
        except RegistrationError:
            raise
        except Exception:
            raise RegistrationError("invalid_geotiff") from None
    if suffix == ".gpkg":
        try:
            with sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True) as gpkg:
                content = gpkg.execute("SELECT min_x,min_y,max_x,max_y,srs_id FROM gpkg_contents WHERE data_type='features' ORDER BY table_name LIMIT 1").fetchone()
                if content:
                    crs_row = gpkg.execute("SELECT organization,organization_coordsys_id FROM gpkg_spatial_ref_sys WHERE srs_id=?", (content[4],)).fetchone()
                    crs = f"{crs_row[0]}:{crs_row[1]}" if crs_row else "unknown"
                    bounds = list(content[:4]) if all(value is not None for value in content[:4]) else None
                    return crs, bounds
                gpkg.execute("SELECT 1 FROM gpkg_contents LIMIT 1").fetchone()
                return "unknown", None
        except sqlite3.Error:
            raise RegistrationError("invalid_geopackage") from None
    if suffix == ".zip":
        try:
            with zipfile.ZipFile(path) as archive:
                names = [name for name in archive.namelist() if not name.endswith("/")]
                lower = [name.lower() for name in names]
                if not any(name.endswith(".shp") for name in lower) or not any(name.endswith(".shx") for name in lower) or not any(name.endswith(".dbf") for name in lower):
                    raise RegistrationError("zip_must_contain_shapefile_components")
                prj = next((name for name in names if name.lower().endswith(".prj")), None)
                crs = "unknown"
                if prj:
                    try:
                        from pyproj import CRS
                        crs = CRS.from_wkt(archive.read(prj).decode("utf-8", errors="replace")).to_string()
                    except Exception:
                        crs = "unknown"
            with zipfile.ZipFile(path) as archive:
                shp_name = next(name for name in archive.namelist() if name.lower().endswith(".shp"))
                header = archive.read(shp_name)[:100]
                bounds = list(struct.unpack("<4d", header[36:68])) if len(header) >= 68 and struct.unpack(">i", header[:4])[0] == 9994 else None
            return crs, bounds
        except zipfile.BadZipFile:
            raise RegistrationError("invalid_zip") from None
    if suffix == ".nc":
        with path.open("rb") as stream:
            signature = stream.read(8)
        if not (signature.startswith(b"CDF") or signature == b"\x89HDF\r\n\x1a\n"):
            raise RegistrationError("invalid_netcdf_signature")
        try:
            import rasterio
            with rasterio.open(path) as raster:
                if raster.count:
                    bounds = raster.bounds
                    return (raster.crs.to_string() if raster.crs else "unknown"), [bounds.left, bounds.bottom, bounds.right, bounds.top]
        except Exception:
            pass
        return "unknown", None
    if suffix == ".csv":
        try:
            with path.open(encoding="utf-8-sig", newline="") as stream:
                csv.reader(stream).__next__()
        except (UnicodeError, csv.Error, StopIteration):
            raise RegistrationError("invalid_csv") from None
        return "unknown", None
    raise RegistrationError("unsupported_format")


async def register_upload(*, region_id: str, source: str, license_name: str, acquired: str, upload: UploadFile) -> dict:
    initialize_database()
    if region_id not in REGION_IDS:
        raise RegistrationError("unknown_region")
    if not source.strip() or not license_name.strip() or not acquired.strip():
        raise RegistrationError("source_license_and_date_required")
    try:
        date.fromisoformat(acquired.strip())
    except ValueError:
        raise RegistrationError("date_must_use_yyyy_mm_dd") from None
    filename = _safe_name(upload.filename or "")
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise RegistrationError("unsupported_format")

    file_id = new_id()
    destination_dir = DATA_ROOT / "raw" / region_id
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / f"{file_id}_{filename}"
    temporary = destination.with_suffix(destination.suffix + ".partial")
    digest = hashlib.sha256()
    written = 0
    stored = False
    try:
        with temporary.open("wb") as target:
            while chunk := await upload.read(CHUNK_SIZE):
                target.write(chunk)
                digest.update(chunk)
                written += len(chunk)
        if written == 0:
            raise RegistrationError("empty_file")
        checksum = digest.hexdigest()
        crs, bounds = inspect_file(temporary, suffix)
        verify_hash = hashlib.sha256()
        verified_bytes = 0
        with temporary.open("rb") as stream:
            while chunk := stream.read(CHUNK_SIZE):
                verify_hash.update(chunk)
                verified_bytes += len(chunk)
        if verified_bytes != written or verify_hash.hexdigest() != checksum:
            raise RegistrationError("integrity_check_failed", 500)

        with get_connection() as conn:
            duplicate = conn.execute("SELECT id, path FROM dataset_files WHERE checksum = ?", (checksum,)).fetchone()
            if duplicate:
                raise RegistrationError("duplicate_file", 409)
            temporary.replace(destination)
            stored = True
            dataset_id = f"user-{region_id}-{file_id}"
            registered_at = datetime.now(timezone.utc).isoformat()
            relative_path = (Path("data") / destination.relative_to(DATA_ROOT)).as_posix()
            region_name = {"mexico_city": "Mexico City", "assam": "Assam", "antarctica": "Antarctica"}[region_id]
            conn.execute("INSERT INTO regions(id, name, status, aoi_json, aoi_status, notes) VALUES (?, ?, 'planned', NULL, 'needs_review', 'User registered file; AOI approval and data status require review.') ON CONFLICT(id) DO NOTHING", (region_id, region_name))
            conn.execute("INSERT INTO datasets(id, region_id, name, provider, product, dates_json, resolution, license, processing, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (dataset_id, region_id, filename, source.strip(), suffix.lstrip("."), json.dumps(acquired), "unknown", license_name.strip(), "Original uploaded unchanged; CRS/bounds extracted where supported.", "downloaded"))
            conn.execute("INSERT INTO dataset_files(id, dataset_id, path, status, size_bytes, appearance, checksum, source, acquisition_date, license, format, crs, bounds_json, registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (file_id, dataset_id, relative_path, "downloaded", str(written), "Data Library", checksum, source.strip(), acquired, license_name.strip(), suffix.lstrip("."), crs, json.dumps(bounds) if bounds else None, registered_at))
            conn.execute("INSERT INTO manifest_entries(id, region_id, dataset_name, source, product_id, acquisition_date, downloaded_on, product_type, resolution, crs, license, processing_level, file_path, quality_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (f"registered::{file_id}", region_id, filename, source.strip(), "unknown", acquired, date.today().isoformat(), suffix.lstrip("."), "unknown", crs, license_name.strip(), "unknown", relative_path, f"SHA-256 {checksum}; original bytes stored unchanged; bounds {json.dumps(bounds) if bounds else 'unknown'}."))
        return {"dataset_id": dataset_id, "file_id": file_id, "path": relative_path, "size_bytes": written, "checksum_sha256": checksum, "crs": crs, "bounds": bounds, "status": "downloaded"}
    except RegistrationError:
        if stored and destination.exists():
            destination.unlink()
        raise
    except OSError:
        if stored and destination.exists():
            destination.unlink()
        raise RegistrationError("file_storage_failed", 500) from None
    except Exception:
        if stored and destination.exists():
            destination.unlink()
        raise RegistrationError("registration_failed", 500) from None
    finally:
        if temporary.exists():
            temporary.unlink()

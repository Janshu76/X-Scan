from __future__ import annotations

import hashlib
import json
import os
import re
import time
from urllib.parse import urlsplit
from datetime import date
from pathlib import Path
from typing import Any, Callable

from backend.app.acquisition.adapters import SearchCriteria
from backend.app.database import get_connection, initialize_database, new_id
from backend.app.jobs import utc_now
from backend.app.settings import DATA_ROOT, EARTHDATA_TOKEN, ROOT
from backend.app.acquisition.adapters import SearchCriteria

COLLECTIONS = {
    "opera_disp_s1": ("OPERA-S1", "DISP-S1"),
    "sentinel1_grd": ("SENTINEL-1", "GRD_HD"),
    "sentinel1_slc": ("SENTINEL-1", "SLC"),
    "nisar": ("NISAR", None),
}
ALLOWED_REGIONS = {"mexico_city", "assam", "antarctica"}
SECRET_KEYS = {"url", "urls", "downloadurl", "browse", "browseurl", "credentials", "token"}
MAX_PRODUCT_BYTES = 25 * 1024**3


class AcquisitionError(ValueError):
    def __init__(self, code: str, status_code: int = 422):
        super().__init__(code)
        self.code = code
        self.status_code = status_code


def _safe_metadata(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _safe_metadata(child) for key, child in value.items() if str(key).lower() not in SECRET_KEYS}
    if isinstance(value, (list, tuple)):
        return [_safe_metadata(child) for child in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _as_float(value: Any) -> float | None:
    try:
        result = float(value)
        return result if result >= 0 else None
    except (TypeError, ValueError):
        return None


def normalize_product(product: Any, collection: str) -> dict[str, Any]:
    properties = dict(getattr(product, "properties", {}) or {})
    product_id = str(properties.get("sceneName") or properties.get("fileID") or properties.get("granuleName") or properties.get("productName") or properties.get("fileName") or "unknown")
    files = properties.get("bytes")
    urls = properties.get("url")
    byte_total: int | None = None
    main_file = None
    if isinstance(files, dict):
        candidates = [(name, item) for name, item in files.items() if isinstance(item, dict) and str(name).lower().endswith((".h5", ".nc", ".zip", ".tif", ".tiff"))]
        if candidates:
            main_file, main_info = next((item for item in candidates if str(item[0]).lower().endswith(".h5")), candidates[0])
            byte_total = int(main_info.get("bytes")) if str(main_info.get("bytes", "")).isdigit() else None
    else:
        try:
            byte_total = int(files) if files is not None else None
        except (TypeError, ValueError):
            byte_total = None
    if isinstance(urls, dict) and main_file and main_file in urls:
        download_url = urls[main_file]
    elif isinstance(urls, str):
        download_url = urls
    else:
        download_url = properties.get("url") or properties.get("downloadUrl") or properties.get("downloadURL") or getattr(product, "downloadUrl", None)
    level = str(properties.get("processingLevel") or properties.get("productType") or properties.get("product_type") or "unknown")
    direction = str(properties.get("flightDirection") or properties.get("orbitDirection") or properties.get("flight_direction") or "unknown")
    start = str(properties.get("startTime") or properties.get("acquisitionDate") or properties.get("start") or "unknown")
    browse = properties.get("browse") or properties.get("browseUrl")
    if isinstance(browse, dict):
        browse = list(browse.values())
    size = _as_float(byte_total if byte_total is not None else properties.get("bytes"))
    checksum = properties.get("checksum") or properties.get("md5sum") or properties.get("md5")
    if isinstance(checksum, dict):
        checksum = checksum.get("value") or checksum.get("checksum") or checksum.get("md5sum")
    metadata = _safe_metadata(properties)
    return {
        "product_id": product_id,
        "provider": "ASF DAAC",
        "collection": collection,
        "processing_level": level,
        "start_time": start,
        "flight_direction": direction,
        "polarization": properties.get("polarization", "unknown"),
        "beam_mode": properties.get("beamMode", properties.get("beam_mode", "unknown")),
        "size_bytes": int(size) if size is not None else None,
        "provider_checksum": str(checksum) if checksum else None,
        "main_file": main_file,
        "download_url": download_url,
        "browse": _safe_metadata(browse),
        "metadata": metadata,
    }


def _region_wkt(region_id: str) -> str:
    if region_id == "mexico_city":
        path = ROOT / "data" / "mexico_city" / "aoi.geojson"
    else:
        path = ROOT / "data" / "regions" / region_id / "aoi_draft.geojson"
    if not path.is_file():
        raise AcquisitionError("region_aoi_not_available")
    geojson = json.loads(path.read_text(encoding="utf-8"))
    if geojson.get("type") == "FeatureCollection":
        first_feature = next(iter(geojson.get("features", [])), None)
        geometry = first_feature.get("geometry") if first_feature else None
    elif geojson.get("type") == "Feature":
        geometry = geojson.get("geometry")
    else:
        geometry = geojson
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not coordinates or not coordinates[0]:
        raise AcquisitionError("region_aoi_invalid")
    ring = coordinates[0]
    return "POLYGON((" + ",".join(f"{float(point[0])} {float(point[1])}" for point in ring) + "))"


def _valid_criteria(criteria: SearchCriteria) -> tuple[str, str, str | None]:
    if criteria.region_id not in ALLOWED_REGIONS:
        raise AcquisitionError("unknown_region")
    if criteria.collection not in COLLECTIONS:
        raise AcquisitionError("unsupported_collection")
    try:
        start, end = date.fromisoformat(criteria.start), date.fromisoformat(criteria.end)
    except ValueError:
        raise AcquisitionError("dates_must_use_yyyy_mm_dd") from None
    if end < start:
        raise AcquisitionError("end_before_start")
    if not 1 <= criteria.max_results <= 100:
        raise AcquisitionError("max_results_must_be_between_1_and_100")
    dataset, default_level = COLLECTIONS[criteria.collection]
    level = criteria.product_type or default_level
    if criteria.collection == "nisar" and not level:
        raise AcquisitionError("nisar_processing_level_required_to_exclude_non_radar_support_files")
    return dataset, level or "", _region_wkt(criteria.region_id)


def search_asf(criteria: SearchCriteria, asf_module=None) -> list[dict[str, Any]]:
    dataset, level, wkt = _valid_criteria(criteria)
    if asf_module is None:
        try:
            import asf_search as asf_module
        except ImportError:
            raise AcquisitionError("asf_search_not_installed", 503) from None
    kwargs: dict[str, Any] = {
        "dataset": dataset,
        "intersectsWith": wkt,
        "start": criteria.start,
        "end": criteria.end,
        "maxResults": criteria.max_results,
    }
    if level:
        kwargs["processingLevel"] = level
    if criteria.polarization:
        kwargs["polarization"] = criteria.polarization
    if criteria.orbit_direction:
        kwargs["flightDirection"] = criteria.orbit_direction.upper()
    if criteria.beam_mode:
        kwargs["beamMode"] = criteria.beam_mode
    try:
        results = asf_module.search(**kwargs)
    except Exception as exc:
        raise AcquisitionError("asf_search_failed_" + type(exc).__name__, 502) from None
    normalized = [normalize_product(product, criteria.collection) for product in results]
    if criteria.collection == "nisar" and criteria.product_type:
        normalized = [product for product in normalized if product["processing_level"].upper().startswith(criteria.product_type.upper())]
    return normalized[:criteria.max_results]


def save_search(criteria: SearchCriteria, products: list[dict[str, Any]]) -> str:
    search_id = new_id()
    result_rows = []
    with get_connection() as conn:
        existing_region = conn.execute("SELECT id FROM regions WHERE id = ?", (criteria.region_id,)).fetchone()
        if not existing_region:
            name = {"mexico_city": "Mexico City", "assam": "Assam", "antarctica": "Antarctica"}[criteria.region_id]
            aoi_status = "approved" if criteria.region_id == "mexico_city" else "draft_not_approved"
            aoi_path = "data/mexico_city/aoi.geojson" if criteria.region_id == "mexico_city" else f"data/regions/{criteria.region_id}/aoi_draft.geojson"
            conn.execute("INSERT INTO regions(id, name, status, aoi_json, aoi_status, notes) VALUES (?, ?, ?, ?, ?, ?)", (criteria.region_id, name, "available" if criteria.region_id == "mexico_city" else "planned", aoi_path, aoi_status, "ASF search performed against this AOI."))
        conn.execute("INSERT INTO search_results(id, region_id, provider, searched_at, criteria_json, summary_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)", (search_id, criteria.region_id, "ASF DAAC", utc_now(), json.dumps(criteria.__dict__), json.dumps({"count": len(products)}), "completed"))
        for product in products:
            result_id = new_id()
            result_rows.append(result_id)
            conn.execute("INSERT INTO search_results(id, region_id, provider, searched_at, criteria_json, summary_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)", (result_id, criteria.region_id, "ASF DAAC product", utc_now(), json.dumps({"search_id": search_id}), json.dumps(product), "available"))
    return search_id


def selected_products(search_id: str, product_ids: list[str], conn) -> list[dict[str, Any]]:
    if not product_ids or len(product_ids) > 10 or len(set(product_ids)) != len(product_ids):
        raise AcquisitionError("select_between_1_and_10_products")
    rows = conn.execute("SELECT summary_json, criteria_json FROM search_results WHERE provider = 'ASF DAAC product' AND status = 'available'").fetchall()
    catalog = [json.loads(row["summary_json"]) for row in rows if json.loads(row["criteria_json"]).get("search_id") == search_id]
    by_id = {item["product_id"]: item for item in catalog}
    if any(product_id not in by_id for product_id in product_ids):
        raise AcquisitionError("selected_product_not_in_search")
    return [by_id[product_id] for product_id in product_ids]


class DownloadManager:
    def __init__(self, data_root: Path = DATA_ROOT, token: str | None = None, session_factory: Callable | None = None):
        self.data_root = data_root
        self.token = token if token is not None else EARTHDATA_TOKEN
        self.session_factory = session_factory

    def _session(self):
        if self.session_factory:
            return self.session_factory(self.token)
        try:
            import asf_search as asf
        except ImportError:
            raise AcquisitionError("asf_search_not_installed", 503) from None
        if not self.token:
            raise AcquisitionError("EARTHDATA_TOKEN_not_configured")
        return asf.ASFSession().auth_with_token(self.token)

    def download(self, *, region_id: str, product: dict[str, Any], progress: Callable[[dict[str, Any]], None] | None = None, retries: int = 3) -> dict[str, Any]:
        initialize_database()
        if region_id not in ALLOWED_REGIONS:
            raise AcquisitionError("unknown_region")
        expected = product.get("size_bytes")
        if expected is not None and (expected <= 0 or expected > MAX_PRODUCT_BYTES):
            raise AcquisitionError("product_size_out_of_bounds")
        url = product.get("download_url")
        hostname = urlsplit(url).hostname.lower() if isinstance(url, str) and urlsplit(url).hostname else ""
        allowed_host = hostname == "asf.alaska.edu" or hostname.endswith(".asf.alaska.edu") or hostname == "earthdatacloud.nasa.gov" or hostname.endswith(".earthdatacloud.nasa.gov") or hostname == "asfdaac.usgs.gov" or hostname.endswith(".asfdaac.usgs.gov")
        if not isinstance(url, str) or urlsplit(url).scheme != "https" or not allowed_host:
            raise AcquisitionError("product_download_url_unavailable")
        product_id = str(product.get("product_id", "unknown"))
        name = str(product.get("main_file") or url.rsplit("/", 1)[-1].split("?", 1)[0] or product_id)
        name = re.sub(r"[^A-Za-z0-9._-]", "_", Path(name).name)
        target_dir = self.data_root / "raw" / region_id / "asf"
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / name
        if target.exists():
            actual = target.stat().st_size
            if expected is None or actual == expected:
                digest = _sha256(target)
                self._record(region_id, product, target, digest)
                return {"status": "duplicate", "path": target.as_posix(), "size_bytes": actual, "checksum_sha256": digest}
        partial = target.with_suffix(target.suffix + ".part")
        session = self._session()
        last_code = "download_failed"
        for attempt in range(retries):
            offset = partial.stat().st_size if partial.exists() else 0
            headers = {"Range": f"bytes={offset}-"} if offset else {}
            try:
                response = session.get(url, headers=headers, stream=True, timeout=(30, 120))
                if offset and response.status_code == 200:
                    partial.unlink(missing_ok=True)
                    offset = 0
                    response.close()
                    response = session.get(url, stream=True, timeout=(30, 120))
                if response.status_code not in ({206, 200} if offset else {200, 206}):
                    last_code = f"http_{response.status_code}"
                    response.close()
                    raise AcquisitionError(last_code, 502)
                content_range = getattr(response, "headers", {}).get("Content-Range", "")
                if offset and response.status_code == 206 and content_range and not content_range.lower().startswith(f"bytes {offset}-"):
                    response.close()
                    raise AcquisitionError("resume_range_mismatch", 502)
                mode = "ab" if offset and response.status_code == 206 else "wb"
                downloaded = offset if mode == "ab" else 0
                total = expected
                with partial.open(mode) as stream:
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if not chunk:
                            continue
                        if downloaded + len(chunk) > MAX_PRODUCT_BYTES:
                            raise AcquisitionError("download_exceeds_safety_limit", 413)
                        stream.write(chunk)
                        downloaded += len(chunk)
                        if progress:
                            progress({"product_id": product_id, "downloaded_bytes": downloaded, "total_bytes": total})
                response.close()
                if expected is not None and partial.stat().st_size != expected:
                    last_code = "reported_size_mismatch"
                    partial.unlink(missing_ok=True)
                    if attempt + 1 < retries:
                        continue
                    raise AcquisitionError(last_code, 502)
                break
            except AcquisitionError as exc:
                if exc.code == "download_exceeds_safety_limit":
                    partial.unlink(missing_ok=True)
                    raise
                if attempt + 1 == retries:
                    raise
            except Exception:
                last_code = "download_connection_failed"
                if attempt + 1 == retries:
                    raise AcquisitionError(last_code, 502) from None
                time.sleep(min(2**attempt, 4))
        if not partial.exists() or not partial.stat().st_size:
            raise AcquisitionError(last_code, 502)
        final_size = partial.stat().st_size
        digest, md5_digest = _checksums(partial)
        expected_checksum = str(product.get("provider_checksum") or "").lower().replace("md5:", "").replace("sha256:", "").strip()
        if expected_checksum and expected_checksum not in {digest.lower(), md5_digest.lower()}:
            partial.unlink(missing_ok=True)
            raise AcquisitionError("provider_checksum_mismatch", 502)
        with get_connection() as conn:
            duplicate = conn.execute("SELECT path FROM dataset_files WHERE checksum = ? LIMIT 1", (digest,)).fetchone()
        if duplicate:
            partial.unlink(missing_ok=True)
            return {"status": "duplicate", "path": duplicate["path"], "size_bytes": final_size, "checksum_sha256": digest}
        partial.replace(target)
        self._record(region_id, product, target, digest)
        return {"status": "downloaded", "path": target.as_posix(), "size_bytes": target.stat().st_size, "checksum_sha256": digest}

    def _record(self, region_id: str, product: dict[str, Any], target: Path, digest: str) -> None:
        relative = target.relative_to(self.data_root.parent).as_posix()
        product_id = str(product.get("product_id", target.name))
        with get_connection() as conn:
            row = conn.execute("SELECT id FROM datasets WHERE id = ?", (product_id,)).fetchone()
            dataset_id = product_id
            if not row:
                dataset_id = "asf-" + hashlib.sha256(product_id.encode()).hexdigest()[:24]
                conn.execute("INSERT INTO regions(id, name, status, aoi_json, aoi_status, notes) VALUES (?, ?, 'available', NULL, 'see catalog', 'ASF acquisition region.') ON CONFLICT(id) DO NOTHING", (region_id, region_id.replace("_", " ").title()))
                conn.execute("INSERT INTO datasets(id, region_id, name, provider, product, dates_json, resolution, license, processing, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'downloaded') ON CONFLICT(id) DO NOTHING", (dataset_id, region_id, product_id, "ASF DAAC", str(product.get("collection", "unknown")), json.dumps(product.get("start_time", "unknown")), "unknown", "NASA Earthdata / ASF terms; verify product citation", "Downloaded by explicit ASF selection.",))
            conn.execute("INSERT INTO dataset_files(id, dataset_id, path, status, size_bytes, appearance, checksum, source, acquisition_date, license, format, crs, bounds_json, registered_at) VALUES (?, ?, ?, 'downloaded', ?, 'Data Library', ?, 'ASF DAAC', ?, 'NASA Earthdata / ASF terms; verify product citation', ?, 'unknown', NULL, ?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,status='downloaded',size_bytes=excluded.size_bytes,checksum=excluded.checksum", ("asf-file-" + hashlib.sha256(relative.encode()).hexdigest()[:24], dataset_id, relative, str(target.stat().st_size), digest, str(product.get("start_time", "unknown")), target.suffix.lstrip("."), utc_now()))
            conn.execute("INSERT INTO manifest_entries(id, region_id, dataset_name, source, product_id, acquisition_date, downloaded_on, product_type, resolution, crs, license, processing_level, file_path, quality_notes) VALUES (?, ?, ?, 'ASF DAAC', ?, ?, ?, ?, 'unknown', 'unknown', 'NASA Earthdata / ASF terms; verify citation', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET downloaded_on=excluded.downloaded_on,file_path=excluded.file_path,quality_notes=excluded.quality_notes", ("asf-manifest-" + hashlib.sha256(product_id.encode()).hexdigest()[:24], region_id, product_id, product_id, str(product.get("start_time", "unknown")), date.today().isoformat(), str(product.get("collection", "unknown")), str(product.get("processing_level", "unknown")), relative, f"size_bytes={target.stat().st_size}; sha256={digest}; downloaded explicitly."))


def _sha256(path: Path) -> str:
    return _checksums(path)[0]


def _checksums(path: Path) -> tuple[str, str]:
    digest = hashlib.sha256()
    md5_digest = hashlib.md5()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            md5_digest.update(chunk)
    return digest.hexdigest(), md5_digest.hexdigest()

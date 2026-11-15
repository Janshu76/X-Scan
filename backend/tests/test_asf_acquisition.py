from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from backend.app.acquisition.adapters import SearchCriteria
from backend.app.acquisition.asf import AcquisitionError, DownloadManager, normalize_product, search_asf
from backend.app import database
from backend.app.main import app
from fastapi.testclient import TestClient


class FakeProduct:
    def __init__(self, properties):
        self.properties = properties


class FakeASF:
    def __init__(self, products):
        self.products = products
        self.kwargs = None

    def search(self, **kwargs):
        self.kwargs = kwargs
        return self.products


def test_search_filters_to_selected_nisar_processing_level_and_normalizes_files():
    products = [
        FakeProduct({
            "fileID": "NISAR_L2_PR_GUNW_test", "processingLevel": "L2_PR_GUNW", "flightDirection": "DESCENDING",
            "startTime": "2026-07-16T00:00:00Z", "bytes": {"main.h5": {"bytes": 2_300_000_000}, "main.QA_REPORT.pdf": {"bytes": 12}},
            "url": {"main.h5": "https://nisar.asf.earthdatacloud.nasa.gov/product/main.h5"}, "browse": {"preview": "https://browse.example/preview.png"},
        }),
        FakeProduct({"fileID": "NISAR_ECMWF_SMST_support", "processingLevel": "ECMWF_SMST", "bytes": 99, "url": "https://asf.alaska.edu/support"}),
    ]
    fake = FakeASF(products)
    criteria = SearchCriteria(region_id="mexico_city", collection="nisar", start="2026-07-01", end="2026-07-31", product_type="L2_PR_GUNW", max_results=10)
    found = search_asf(criteria, asf_module=fake)
    assert fake.kwargs["dataset"] == "NISAR"
    assert fake.kwargs["processingLevel"] == "L2_PR_GUNW"
    assert len(found) == 1
    assert found[0]["size_bytes"] == 2_300_000_000
    assert found[0]["download_url"].endswith("main.h5")
    assert "url" not in found[0]["metadata"]


def test_search_rejects_invalid_date_and_nisar_without_processing_filter():
    fake = FakeASF([])
    with pytest.raises(AcquisitionError, match="nisar_processing_level_required"):
        search_asf(SearchCriteria("mexico_city", "nisar", "2026-01-01", "2026-01-02"), fake)
    with pytest.raises(AcquisitionError, match="dates_must_use"):
        search_asf(SearchCriteria("mexico_city", "sentinel1_grd", "bad", "2026-01-02"), fake)


class FakeResponse:
    def __init__(self, body: bytes, status=200, headers=None):
        self.body = body
        self.status_code = status
        self.headers = headers or {}
        self.closed = False

    def iter_content(self, chunk_size):
        yield self.body

    def close(self):
        self.closed = True


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(kwargs)
        return self.responses.pop(0)


def test_download_resumes_partial_checks_integrity_and_registers(tmp_path, monkeypatch):
    from backend.app import database

    monkeypatch.setattr(database, "DB_PATH", tmp_path / "registry.sqlite3")
    data_root = tmp_path / "data"
    target = data_root / "raw" / "mexico_city" / "asf" / "product.h5"
    target.parent.mkdir(parents=True)
    target.with_suffix(".h5.part").write_bytes(b"abc")
    response = FakeResponse(b"defg", status=206, headers={"Content-Range": "bytes 3-6/7"})
    session = FakeSession([response])
    manager = DownloadManager(data_root=data_root, token="test-only", session_factory=lambda _: session)
    progress = []
    product = {"product_id": "scene-1", "collection": "nisar", "processing_level": "L2_PR_GUNW", "start_time": "2026-01-01", "size_bytes": 7, "main_file": "product.h5", "download_url": "https://nisar.asf.earthdatacloud.nasa.gov/file/product.h5"}
    result = manager.download(region_id="mexico_city", product=product, progress=progress.append)
    assert result["status"] == "downloaded"
    assert target.read_bytes() == b"abcdefg"
    assert result["checksum_sha256"] == hashlib.sha256(b"abcdefg").hexdigest()
    assert session.calls[0]["headers"]["Range"] == "bytes=3-"
    assert progress[-1]["downloaded_bytes"] == 7
    duplicate = manager.download(region_id="mexico_city", product=product)
    assert duplicate["status"] == "duplicate"
    assert len(session.calls) == 1


def test_download_rejects_untrusted_host_and_detects_checksum_mismatch(tmp_path):
    session = FakeSession([FakeResponse(b"abc")])
    manager = DownloadManager(data_root=tmp_path / "data", token="test-only", session_factory=lambda _: session)
    unsafe = {"product_id": "x", "size_bytes": 3, "download_url": "https://asf.alaska.edu.attacker.invalid/file"}
    with pytest.raises(AcquisitionError, match="product_download_url_unavailable"):
        manager.download(region_id="mexico_city", product=unsafe)
    mismatch = {"product_id": "x", "size_bytes": 3, "download_url": "https://asf.alaska.edu/file", "provider_checksum": "0" * 64}
    with pytest.raises(AcquisitionError, match="provider_checksum_mismatch"):
        manager.download(region_id="mexico_city", product=mismatch)


def test_api_requires_explicit_selection_and_queues_only_selected_products(tmp_path, monkeypatch):
    from backend.app.acquisition import api

    monkeypatch.setattr(database, "DB_PATH", tmp_path / "api.sqlite3")
    monkeypatch.setattr(api, "search_asf", lambda criteria: [{
        "product_id": "small-scene", "collection": criteria.collection, "processing_level": "GRD_HD",
        "start_time": criteria.start, "flight_direction": "ASCENDING", "polarization": "VV", "beam_mode": "IW",
        "size_bytes": 1200, "download_url": "https://asf.alaska.edu/small-scene", "metadata": {}, "browse": None,
    }, {
        "product_id": "unselected-scene", "collection": criteria.collection, "processing_level": "GRD_HD",
        "start_time": criteria.start, "flight_direction": "ASCENDING", "polarization": "VV", "beam_mode": "IW",
        "size_bytes": 3400, "download_url": "https://asf.alaska.edu/unselected-scene", "metadata": {}, "browse": None,
    }])
    with TestClient(app) as client:
        result = client.post("/api/acquisition/search", json={"region_id": "mexico_city", "collection": "sentinel1_grd", "start": "2026-01-01", "end": "2026-01-02", "max_results": 2})
        assert result.status_code == 201
        search = result.json()
        refused = client.post("/api/acquisition/download", json={"search_id": search["search_id"], "region_id": "mexico_city", "product_ids": ["small-scene"], "confirmed": False})
        assert refused.status_code == 400
        queued = client.post("/api/acquisition/download", json={"search_id": search["search_id"], "region_id": "mexico_city", "product_ids": ["small-scene"], "confirmed": True})
        assert queued.status_code == 202
        assert queued.json()["selected_count"] == 1
        assert queued.json()["total_bytes"] == 1200
        job = client.get(f"/api/jobs/{queued.json()['job_id']}").json()
        assert json.loads(job["payload_json"])["product_ids"] == ["small-scene"]

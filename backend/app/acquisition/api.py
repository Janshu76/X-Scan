from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app import database
from backend.app.acquisition.adapters import PLACEHOLDER_ADAPTERS, SearchCriteria
from backend.app.acquisition.asf import AcquisitionError, save_search, search_asf, selected_products
from backend.app.jobs import enqueue

router = APIRouter()


class AcquisitionSearchRequest(BaseModel):
    region_id: str
    collection: str
    start: str
    end: str
    product_type: str | None = None
    polarization: str | None = None
    orbit_direction: str | None = None
    beam_mode: str | None = None
    max_results: int = Field(default=20, ge=1, le=100)


class AcquisitionDownloadRequest(BaseModel):
    search_id: str
    region_id: str
    product_ids: list[str] = Field(min_length=1, max_length=10)
    confirmed: bool


def _rows(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with database.get_connection() as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


@router.get("/api/acquisition/providers")
def acquisition_providers() -> dict[str, Any]:
    return {"asf": {"status": "implemented", "auth": "EARTHDATA_TOKEN environment variable for downloads"}, **{key: {"status": "not_implemented", "note": adapter.note} for key, adapter in PLACEHOLDER_ADAPTERS.items()}}


@router.post("/api/acquisition/search", status_code=201)
def acquisition_search(request: AcquisitionSearchRequest) -> dict[str, Any]:
    criteria = SearchCriteria(**request.model_dump())
    try:
        products = search_asf(criteria)
        search_id = save_search(criteria, products)
        return {"search_id": search_id, "count": len(products), "products": [{"product_id": item["product_id"], "collection": item["collection"], "processing_level": item["processing_level"], "start_time": item["start_time"], "flight_direction": item["flight_direction"], "polarization": item["polarization"], "beam_mode": item["beam_mode"], "size_bytes": item["size_bytes"], "browse": item.get("browse"), "main_file": item.get("main_file"), "metadata": item.get("metadata", {})} for item in products]}
    except AcquisitionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from None


@router.get("/api/acquisition/search/{search_id}")
def acquisition_search_detail(search_id: str) -> list[dict[str, Any]]:
    rows = _rows("SELECT criteria_json, summary_json FROM search_results WHERE provider = 'ASF DAAC product' AND status = 'available'")
    return [json.loads(row["summary_json"]) for row in rows if json.loads(row["criteria_json"]).get("search_id") == search_id]


@router.post("/api/acquisition/download", status_code=202)
def acquisition_download(request: AcquisitionDownloadRequest) -> dict[str, str | int]:
    if not request.confirmed:
        raise HTTPException(status_code=400, detail="Explicit size review confirmation is required.")
    if len(set(request.product_ids)) != len(request.product_ids):
        raise HTTPException(status_code=422, detail="Duplicate product IDs are not allowed.")
    try:
        with database.get_connection() as conn:
            search = conn.execute("SELECT criteria_json FROM search_results WHERE id = ? AND provider = 'ASF DAAC'", (request.search_id,)).fetchone()
            if not search:
                raise AcquisitionError("search_not_found", 404)
            search_criteria = json.loads(search["criteria_json"])
            if search_criteria.get("region_id") != request.region_id:
                raise AcquisitionError("region_does_not_match_search")
            products = selected_products(request.search_id, request.product_ids, conn)
        if any(product.get("size_bytes") is None for product in products):
            raise HTTPException(status_code=409, detail="Every selected product needs a reported size before download confirmation.")
        total = sum(int(product["size_bytes"]) for product in products)
        job_id = enqueue("asf_download", {"region_id": request.region_id, "search_id": request.search_id, "product_ids": request.product_ids})
        return {"job_id": job_id, "status": "queued", "selected_count": len(products), "total_bytes": total}
    except AcquisitionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from None

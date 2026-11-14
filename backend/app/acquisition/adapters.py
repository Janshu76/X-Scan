from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class SearchCriteria:
    region_id: str
    collection: str
    start: str
    end: str
    product_type: str | None = None
    polarization: str | None = None
    orbit_direction: str | None = None
    beam_mode: str | None = None
    max_results: int = 20


class ProviderAdapter(Protocol):
    name: str

    def search(self, criteria: SearchCriteria) -> list[dict[str, Any]]: ...


class NotImplementedAdapter:
    def __init__(self, name: str, note: str):
        self.name = name
        self.note = note

    def search(self, _: SearchCriteria) -> list[dict[str, Any]]:
        raise NotImplementedError(f"{self.name} adapter is not implemented. {self.note}")


PLACEHOLDER_ADAPTERS = {
    "copernicus_data_space": NotImplementedAdapter("Copernicus Data Space", "Use its official OData/STAC catalogue and OAuth2 identity service."),
    "usgs_landsat": NotImplementedAdapter("USGS Landsat", "Use USGS M2M or EarthExplorer APIs with USGS authentication."),
    "nasa_earthdata_other": NotImplementedAdapter("Other NASA Earthdata", "Use the relevant mission catalogue and Earthdata Login token; collection-specific adapters are not implemented."),
    "nsidc": NotImplementedAdapter("NSIDC", "Use the NSIDC DAAC API or Earthdata Search/CMR and Earthdata Login authentication."),
}

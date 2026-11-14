# TerraWatch — Mexico City MVP

TerraWatch currently presents one region: Mexico City. The observatory page uses
the **adjusted** Sentinel-1 OPERA pack in `data/mexico_city/subsidence_adjusted/`.
The parallel `data/mexico_city/subsidence/` pack is retained as unadjusted
provenance and is not displayed. Both local packs are compact analysis exports;
they are not the original satellite acquisitions.

## Run locally

1. Install Node.js 20 or later and pnpm.
2. Run `pnpm install` once.
3. Run `pnpm dev` and open the local URL printed by Next.js.

The predev and prebuild hooks stage the adjusted overlays, a derived compact
series, and approved small context files under generated `public/data/`. This
generated folder is ignored by Git. Run `pnpm build` for a static export in
`out/`, then `pnpm start` to preview it at `http://127.0.0.1:4173`.

## Data layout

- `data/catalog/datasets.json` is the machine-readable dataset catalog.
- `data/mexico_city/subsidence_adjusted/` is the pack used by the app. It
  contains the adjusted summary, date overlays, velocity overlay, bounds, and
  compact sampled time-series CSV.
- `data/mexico_city/subsidence/` is the unadjusted provenance pack.
- `data/mexico_city/context/` contains only small GNSS/DEM/manifest context
  files. The UI uses `gnss_vs_insar_v2.json` if v3 is absent and says so.
- `data/mexico_city/nisar/` contains two small preview images and a compact
  grouped summary derived from the large local granule search CSV. NISAR is
  PROVISIONAL context only and is not the subsidence source.
- `data/mexico_city/aoi.geojson` is the study area outline.
- `docs/data-sources.md` records provenance, attribution, assumptions, and
  limitations.

The adjustment subtracts the scene's most common LOS velocity (5.75 cm/yr)
from all pixels. It assumes most of the area is stable ground and the offset is
uniform; neither is proven. Two quiet GNSS stations were used only for an
independent adjustment check, and three stations are compared in the available
v2 GNSS summary. GNSS is vertical motion while InSAR is line-of-sight motion;
the comparison is approximate. The atmosphere is not fully corrected and
chained blocks can accumulate error. The compact time-series sample is
approximate, not a full-scene pixel statistic.

## Original data and scripts

Keep large original satellite files outside Git, for example on a separate
drive or in cloud object storage. The repository ignores `data/originals/`,
`raw/`, `out/`, `.nc`, and `.tenv3`; it does not ignore the catalog or small
sample/context files. Do not copy `.nc`, `.h5`, `.npz`, `raw/clips`,
`raw/osm_cache`, or `raw/gnss` into this repository.

The Mexico City scripts are under `pipeline/` and run from the parent `NSAC/`
folder; the app never runs them. Keep their actual names, including
`12_zone_starts.py` and `16_nisar_preview.py`. See [`pipeline/README.md`](pipeline/README.md)
before running any script.

The basemap uses OpenStreetMap raster tiles and requires an internet connection
while the app is open. Roads/facilities exports are **NOT ADDED**. No exposure
counts, damage assessment, risk score, or forecast is produced. Assam and
Antarctica are not implemented regions.

## Local API and worker

The frontend remains usable from static files when the API is stopped. The
FastAPI service and database-backed worker are optional local services; long
jobs are queued and processed separately from HTTP requests.

```powershell
# Terminal 1: API
.\scripts\start-api.ps1

# Terminal 2: worker
.\scripts\start-worker.ps1

# Health check
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

This machine's PostgreSQL 18 service responds on localhost, but the configured
system Python 3.14 does not have `psycopg` installed and no `psql` client was
available. The backend therefore uses its SQLite development fallback at
`backend/data/terrawatch.sqlite3`; this database is local and gitignored. A
`DATABASE_URL` value in ignored `.env` can select PostgreSQL when a compatible
driver is installed and the connection/PostGIS extension succeeds. Failure to
connect or initialize PostgreSQL falls back to SQLite and is reported by the
health endpoint without printing connection details.

Copy `.env.example` to `.env` for local settings. `EARTHDATA_TOKEN` is read by
the backend only; it is never returned by the API or sent to frontend code.
No live ASF requests or downloads are performed during app startup.

## Shared research data seed

The backend schema is versioned in `backend/migrations/`. Seed the region,
dataset/file inventory, available source manifest, local NISAR search summary,
processing chain and evidence-labelled findings from the real catalog and
adjusted pack with:

```powershell
python -m backend.app.seed --export data\catalog\phase1-snapshot.json
```

The static snapshot is staged to `public/data/terrawatch/` and keeps both views
usable with the API offline. When the API is running, `/api/findings`,
`/api/datasets`, `/api/manifest`, `/api/processing-runs`, and
`/api/search-results` read the same SQLite/PostgreSQL records. Findings retain
their evidence labels, linked datasets and processing runs, limitations, and
uncertainty.

## Data Library and manual file registration

Open `/data-library` while the API is running to see catalog entries, each
file's status and size, provenance fields, and where it appears. The page uses
the static catalog snapshot if the API is stopped. For a manually downloaded
file, provide a region, source, license, date and supported file. The API
validates GeoTIFF, GeoJSON, GeoPackage, shapefile ZIP, NetCDF and CSV; extracts
CRS/bounds where supported; computes SHA-256; rejects duplicate file content;
and writes original bytes unchanged beneath `data/raw/<region>/` (ignored by
Git). Registration is available only while the local API is running.

## Additional study areas

data/regions/assam/ and data/regions/antarctica/ contain draft AOI polygons for Majuli–Jorhat and Pine Island Glacier. Both are explicitly marked draft, not approved. They are search extents only: no observations, regional statistics, or findings are claimed. Their provisional bounds and source references are in each GeoJSON and NEEDS_YOU.md.

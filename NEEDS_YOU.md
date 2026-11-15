# Needs your input

This file collects actions that cannot be completed safely or truthfully by
this workspace run. Work continued with explicitly labelled drafts and local
SQLite where possible.

## 1. Canonical product specification

`docs/product-spec.md` now exists as a scope note transcribed from the Phase 1
work-package instructions. The separate full product specification the prompt
refers to was not present at `docs/product-spec.md`, elsewhere in this checkout,
or in the supplied prompt attachment. Please save the canonical document at
`X-Scan/docs/product-spec.md` (or replace the scope note with it) and review
the Phase 1 scope before future work. No missing Phase 2 or Phase 3 details were
invented.

## 2. Database connection

PostgreSQL 18 is running and its local port responds, but the system Python
environment has neither `psycopg` nor `psycopg2`, and no `psql` client was
available. This run therefore uses the SQLite fallback. To switch to
PostgreSQL/PostGIS:

1. Install a compatible PostgreSQL driver in the project environment after
   reviewing the dependency change: `python -m pip install "psycopg[binary]"`.
2. Create the `terrawatch` database and enable PostGIS from a local SQL prompt:
   `CREATE DATABASE terrawatch;` then connect to it and run
   `CREATE EXTENSION IF NOT EXISTS postgis;`.
3. Put the connection URL in the ignored `X-Scan/.env` file as
   `DATABASE_URL=postgresql+psycopg://terrawatch:<your-local-password>@127.0.0.1:5432/terrawatch`.
   Do not send the password to anyone or commit `.env`.
4. Restart the backend and verify `/api/health` reports the PostgreSQL backend.

## 3. Approve or revise draft study polygons

The polygons below are **draft, not approved**. They are provisional selection
areas only, not scientific observations or official administrative
boundaries. Coordinate references are included in the app and GeoJSON metadata.

- **Assam / Majuli–Jorhat reach:** provisional rectangle
  `[94.05, 26.75]` to `[94.40, 27.18]` (west, south, east, north), intended to
  frame the Brahmaputra corridor near Majuli and Jorhat. The Majuli district
  government describes the island in the Brahmaputra and its southern ferry
  approach at Nimati Ghat in Jorhat:
  https://majuli.assam.gov.in/index.php/about-us/about-district
- **Pine Island Glacier:** provisional rectangle
  `[-103.5, -76.5]` to `[-96.5, -73.5]` (west, south, east, north), centered
  broadly around the SCAR/US Gazetteer named-feature coordinate
  75°10′S, 100°W. This is a map extent, not a glacier boundary:
  https://data.aad.gov.au/aadc/gaz/display_name.cfm?gaz_id=130147

Please approve or send replacement coordinates before treating either AOI as a
study boundary. While awaiting that input, the app marks both **DRAFT · NOT
APPROVED** and reports no regional measurements.

## 4. ASF live search and small download

No live ASF request was made. Start the API and worker in two terminals from
`X-Scan`; the search itself does not need credentials, while a real download
requires `EARTHDATA_TOKEN` available to the backend process. Set that secret
using your local secret-management method before starting the API. Do not put
the value in a command, file, chat, or screenshot.

Terminal 1 (API):

```powershell
cd C:\Users\Intel\Desktop\NSAC\X-Scan
python -m uvicorn backend.app.main:app --reload --port 8000
```

Terminal 2 (worker):

```powershell
cd C:\Users\Intel\Desktop\NSAC\X-Scan
python -m backend.app.worker
```

Terminal 3: search a short, bounded Sentinel-1 GRD period and inspect product
IDs and byte sizes. This request only searches; it does not download.

```powershell
$body = @{ region_id='mexico_city'; collection='sentinel1_grd'; product_type='GRD_HD'; start='2025-01-01'; end='2025-01-07'; max_results=3 } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/acquisition/search -ContentType 'application/json' -Body $body
$r.products | Select-Object product_id, processing_level, size_bytes, start_time, flight_direction
```

After reviewing the results, select exactly one returned ID and check its
reported size. Replace `PASTE-RETURNED-ID` below with that ID. The API rejects
IDs that were not in the named search. This is the explicit confirmation step:

```powershell
$download = @{ search_id=$r.search_id; region_id='mexico_city'; product_ids=@('PASTE-RETURNED-ID'); confirmed=$true } | ConvertTo-Json
$job = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/acquisition/download -ContentType 'application/json' -Body $download
$job
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/jobs/$($job.job_id)"
```

Poll the final command until status is `succeeded` or `failed`. Downloaded files
are written to ignored `data/raw/mexico_city/asf/`; the local manifest records
size and SHA-256. Never request a product whose size you have not reviewed.

## 5. Manual region data

No Assam or Antarctica observations were downloaded. When you are ready, use
the research Data Acquisition page to fetch exactly two Sentinel-1 GRD scenes
for Assam (one before and one during/after a selected flood event) and one
Sentinel-1 scene for Pine Island Glacier. MEaSUREs ice velocity is available
from NSIDC DAAC dataset NSIDC-0545:
https://nsidc.org/data/NSIDC-0545/versions/1

## 6. Script and source limitations

The live ASF, Overpass, Copernicus and NSIDC services were not called. The
backend acquisition tests use mocked provider responses. Review output sizes
and licences before any live downloads; large products must remain outside Git.

# Data sources

Keep original satellite acquisitions outside Git. Small derived previews and
compact samples may live in the repository when their provenance and caveats
are recorded here and in [`../data/catalog/datasets.json`](../data/catalog/datasets.json).

## Mexico City displacement: displayed adjusted pack

The app displays `data/mexico_city/subsidence_adjusted/`, derived from NASA/JPL
OPERA L3 DISP-S1 V1 via ASF DAAC: Sentinel-1 ascending, frame 20688, VV, 30 m
source product, ten dates from 2022-03-27 through 2026-02-16. Included exports
are the summary, sampled `timeseries_points.csv`, cumulative date overlays,
velocity overlay, and overlay bounds. The headline is computed from the mean
LOS rate of the most-subsiding 1% of points in that compact sample; it is not a
full-scene pixel statistic.

### Adjustment and uncertainty

The displayed pack subtracts the scene's most common LOS velocity of
5.75 cm/year from every pixel and adjusts cumulative bands by elapsed time. It
assumes most of the area is stable ground and that the offset is uniform across
the scene. Neither assumption is proven. The values remain relative LOS
measurements, not vertical motion or absolute ground movement. Atmospheric
correction is incomplete, chained blocks can accumulate error, and the compact
sample is approximate.

Two quiet GNSS stations were used only as an independent adjustment check, not
to determine the offset. The available `gnss_vs_insar_v2.json` compares three
stations. GNSS rates are vertical while InSAR rates are LOS; their comparison
is approximate and station coverage differs. `gnss_vs_insar_v3.json` is
**NOT ADDED**; the UI explicitly falls back to v2.

## Unadjusted provenance pack

`data/mexico_city/subsidence/` holds the corresponding unadjusted compact pack
for provenance. It is not used by the map. Original NetCDF products and full
rasters remain outside this repository. Product-specific redistribution terms
were not recorded in the supplied export; verify them with NASA ASF DAAC before
redistributing the product files.

## Terrain and GNSS context

- Copernicus DEM GLO-30 context is represented by
  `data/mexico_city/context/dem_info.json` and a small
  `hillshade_overlay.png`; source data are from 2011–2015, with the 2021
  release. Credit: **Contains modified Copernicus data**.
- `gnss.json` is from Nevada Geodetic Laboratory. Cite Blewitt et al. 2018.
- `manifest.csv` records context source, acquisition/date information,
  resolution, license, and local file names.
- Roads and facilities GeoJSON are **NOT ADDED**, so no exposure counts or
  sampled lengths are reported. If added, credit © OpenStreetMap contributors
  and follow ODbL 1.0.

## NISAR search context

`data/mexico_city/nisar/granules_summary.json` is a compact count and date-range
summary grouped by product type and flight direction from the local
`raw/nisar_granules.csv`; the CSV itself remains outside the repository. Two
small preview PNGs are included. These are **PROVISIONAL** SAR lab context only
and do not supply any Mexico City subsidence rates. NISAR products are free and
open via ASF DAAC; check NASA citation guidance before reuse.

## Original files and processing

Keep `.nc`, `.h5`, `.npz`, `raw/clips`, `raw/osm_cache`, `raw/gnss`, full
GeoTIFFs, and other large originals outside Git, such as on a separate drive
or cloud object storage. `.gitignore` includes `data/originals/` as an optional
in-repository holding location and ignores generated `public/data/` staging.
The app does not download or run the scripts. The actual script names include
`12_zone_starts.py` and `16_nisar_preview.py`; do not rename them.

The machine-readable inventory is in `../data/catalog/datasets.json`. The
generated `public/data/regions/mexico_city/series.json` is derived at staging
time from the adjusted summary and compact CSV; it is not an independent source
dataset.

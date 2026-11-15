# Mexico City subsidence pack

Source: OPERA L3 DISP-S1 V1 (NASA/JPL), Sentinel-1, ascending, frame 20688, VV polarisation, 30 m.
Period: 2022-03-27 to 2026-02-16 (9 reference blocks chained). Area: aoi.geojson (UTM zone 14N, EPSG:32614).

## Files
- velocity_los_cm_per_year.tif - mean line-of-sight (LOS) velocity, cm/year, 30 m. Negative = moving away from the satellite (sinking, if the motion is mostly vertical).
- cumulative_los_cm_90m.tif - 10 bands, cumulative LOS displacement (cm) since 2022-03-27, 90 m. Band N matches dates[N-1] in summary.json.
- overlay_velocity.png, overlay_cumulative_YYYYMMDD.png - coloured RGBA overlays for the web map; corners in overlay_bounds.json.
- timeseries_points.csv - 705 sample points with velocity and cumulative displacement per date.
- summary.json - dates, per-block corrections, statistics, colour limits.

## Caveats (show these in the app)
- Line-of-sight, not vertical. All values are relative to a common reference window near 19.4706N, -99.1344E, so absolute motion is unknown; areas far from it can show apparent uplift.
- Each block was re-referenced to that window before the blocks were added up. Errors can accumulate over blocks; the atmosphere is not fully corrected.
- Only pixels valid in all 9 blocks are kept (75.2% of the area).
- Blocks have different lengths (about 3 to 6.5 months).

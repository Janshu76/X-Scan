# Mexico City subsidence pack (adjusted to estimated stable ground)

Source: OPERA L3 DISP-S1 V1 (NASA/JPL), Sentinel-1, frame 20688, VV, 30 m. Period 2022-03-27 to 2026-02-16.

## What was adjusted
All blocks were measured relative to one reference window inside the city. Stable ground therefore appeared to rise by
about +5.8 cm/yr. That value (the most common velocity in the scene) was subtracted from every pixel, so stable
ground now reads close to 0 and the sinking areas show their larger values.

## Caveats (show these in the app)
- Assumption: most of the area is stable ground and the offset is the same everywhere. Neither is proven.
- Line of sight (LOS), not vertical. Values are relative to estimated stable ground, not absolute.
- The atmosphere is not fully corrected; blocks are chained by summation and errors can accumulate.
- GNSS stations were used only as an independent check (few stations; GNSS is vertical, InSAR is LOS).
- Only pixels valid in all blocks are kept.

## Files
velocity_los_cm_per_year.tif, cumulative_los_cm_90m.tif (one band per date), overlay_*.png with overlay_bounds.json,
timeseries_points.csv, summary.json.

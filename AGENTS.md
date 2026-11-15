# TerraWatch standing rules

1. Use real data only. Never invent observations, dates, sources, numbers, or results. Read displayed numbers at runtime from real files or database records. Never hard-code deprecated headline numbers.
2. Show visible evidence labels wherever findings appear: **Observed**, **Measured**, **Contextual**, **Possible explanation**, **Simulated**, or **Unavailable**. Keep observed results visually distinct from explanations, and show uncertainty and limitations.
3. Mexico City measurements are line-of-sight (LOS), relative to estimated stable ground. The atmosphere is not fully corrected. Never report vertical movement, describe the blue/positive western signal as uplift, or state groundwater as a proven cause. Groundwater is only a possible contributing factor; the app has no groundwater data to test causes. Never describe findings as damage, risk, or forecasts.
4. Describe NISAR honestly as **PROVISIONAL** and as a SAR lab showcase. Never use it as the source of Mexico City subsidence rates.
5. For Antarctica, do not conflate glacier velocity, ice-shelf extent, ice elevation, and ice mass balance. Do not claim ice-shelf retreat directly produces an equivalent sea-level rise. For Assam, keep flood inundation, river migration, erosion, and deposition as separate analyses.
6. Never put passwords or tokens in frontend code, logs, errors, databases, or Git. Redact secrets in logs and scan for secrets before any commit.
7. Keep the repository small. Never commit `.nc`, `.h5`, `raw/`, `raw/osm_cache/`, `raw/gnss/`, `raw/clips/`, `.env`, or files over about 25 MB. The subsidence packs (about 14 MB each) require explicit approval before a commit.
8. Record source, dates, resolution, licence, and attribution for every dataset: NASA/JPL OPERA (open); “Contains modified Copernicus data” for DEM; “(c) OpenStreetMap contributors” (ODbL); Nevada Geodetic Laboratory (cite Blewitt et al. 2018); and NISAR via ASF DAAC (free and open; check NASA citation guidance).
9. Do not create fake data for regions without data. Never present AI text as a measurement or AI imagery as satellite imagery.

# TerraWatch — Mexico City MVP

TerraWatch explores observed land motion in one region: Mexico City. This
static-first Next.js app presents the supplied Sentinel-1 OPERA line-of-sight
displacement series. It does not run download scripts or need Earthdata
credentials.

## Run locally

1. Install Node.js 20 or later and pnpm.
2. Run `pnpm install` once.
3. Run `pnpm dev` and open the local URL printed by Next.js.

The predev and prebuild hooks stage the compact files in
`data/samples/mexico_city/` into the generated `public/data/` folder. Run
`pnpm build` to produce a static export in `out/`. Run `pnpm start` afterward
to preview that export at `http://127.0.0.1:4173`.

## Mexico City data

- Ten displacement overlays and `series.json` are stored in
  `data/samples/mexico_city/`.
- `data/mexico_city/aoi.geojson` defines the study extent.
- `data/samples/mexico_city/inspection_grid.json` is a decimated lookup grid
  derived from the cumulative GeoTIFFs. Point values are approximate nearest
  samples on this grid.
- `data/catalog/datasets.json` records the available dataset and caveats.
- `docs/data-sources.md` describes provenance and missing sources.

Original `.nc` satellite files, raw downloads, and cumulative GeoTIFFs stay
outside the repository. The `/raw/`, `/out/`, `.nc`, and temporary GNSS data
patterns are ignored by Git. Do not put credentials in the repository.

The map base uses OpenStreetMap raster tiles and shows attribution. Its tile
service requires an internet connection when the app is open. The displacement
overlays and analysis text are local files.

The Mexico City data scripts are under `pipeline/`, but the app does not call
them. See [`pipeline/README.md`](pipeline/README.md) before running them; their
download outputs should remain in the parent `NSAC/` folder outside Git.

## Available and pending layers

The OPERA L3 DISP-S1 series is available. OSM roads/facilities, Copernicus
terrain, GNSS, NISAR search results, aquifer boundaries, and building counts
are not in the current export and are shown as unavailable. No damage or risk
assessment is produced.

Assam and Antarctica are future regions; Mexico City is the only implemented
region. See [Data & Methods](/data-methods) for processing notes and limitations.

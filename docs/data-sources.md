# Data sources

Record the source and provenance of every dataset used by TerraWatch. Keep
original satellite files outside Git; this document and the catalog should
describe them without copying the files into the repository.

## Dataset record template

For each dataset, record:

- **Name and region:** A short name and coverage area.
- **Provider and source:** Organization, product name, and source URL or storage
  URI.
- **Acquisition details:** Sensor, acquisition date or range, and spatial
  resolution when known.
- **License and attribution:** Terms of use and required credit.
- **Preparation:** Processing, clipping, reprojection, or other changes made.
- **Storage:** Repository-relative path for a small sample, or external path or
  URI for original satellite files.
- **Catalog entry:** Add a corresponding record to
  [`../data/catalog/datasets.json`](../data/catalog/datasets.json).

## Current Mexico City data

The repository contains the Mexico City OPERA L3 DISP-S1 exported date overlays
and `series.json`, copied from the locally available
`NSAC/out/mexico_city/` directory. The ten dates run from 2022-03-27 to
2026-02-16. The export identifies Sentinel-1, frame 20688, VV polarization,
and centimetres of cumulative line-of-sight displacement. It does not record
spatial resolution or product-specific redistribution terms; verify those with
NASA ASF DAAC before redistributing the files.

The supplied AOI is stored in `data/mexico_city/aoi.geojson`. The dataset
catalog is `data/catalog/datasets.json`. Cumulative GeoTIFFs and original
NetCDF files remain outside the repository. The repository does not currently
contain the OSM, DEM, GNSS, or NISAR search exports, so the app reports those
layers as unavailable rather than inferring values.

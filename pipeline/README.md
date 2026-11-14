# Data pipeline

The Next.js app does not import or execute these scripts. They prepare data
outside the app and never run as part of the web UI.

The numbered Mexico City scripts and `tw_common.py` are copied from the
workspace parent `NSAC/` without changing their contents. Their inputs and
outputs use paths relative to the current working directory. To keep raw files
outside Git, run those original workflow scripts with the parent `NSAC/`
directory as the working directory, for example:

```powershell
cd C:\Users\Intel\Desktop\NSAC
python X-Scan\pipeline\06_build_series.py
```

The downloader scripts prompt before downloads and use a hidden Earthdata
password prompt where required. They do not save credentials. Do not run them
from the `X-Scan/` repository root: that would direct their `raw/` and `out/`
outputs into the repository (those paths are ignored as a safeguard).

`build_inspection_grid.py` is a repository-side helper. It reads the external
cumulative GeoTIFFs and writes a compact, decimated JSON lookup grid. Run it
from `X-Scan/` after the series rasters exist:

```powershell
python pipeline\build_inspection_grid.py --input-dir ..\out\mexico_city --output data\samples\mexico_city\inspection_grid.json
```

The map reports nearest-grid values as approximate. It does not load the full
GeoTIFFs in a browser.

`exposure_summary.py` accepts a final cumulative GeoTIFF plus roads and
facilities GeoJSON and emits counts and sampled road length by absolute LOS
displacement class. It has not been run because those context exports are not
present. Its output describes measured displacement only, never damage or risk.

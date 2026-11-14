"""
Step 8: clip the Copernicus GLO-30 DEM (30 m, open on AWS, no login) to the study box and make a hillshade.

Only the needed window is read from the cloud-optimised GeoTIFFs; nothing large is downloaded.
Note: this is a surface model (DSM), so buildings and trees are included.

Run:  python 08_download_dem.py
Outputs: out/mexico_city/context/dem_mexico_city.tif, hillshade_overlay.png, dem_info.json
"""
import json
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.merge import merge

from tw_common import add_manifest, box_wgs84

OUT = os.path.join("out", "mexico_city", "context")
os.makedirs(OUT, exist_ok=True)
W, S, E, N = box_wgs84()


def tile_url(lat, lon):
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    name = f"Copernicus_DSM_COG_10_{ns}{abs(lat):02d}_00_{ew}{abs(lon):03d}_00_DEM"
    return f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"


urls = [tile_url(la, lo)
        for la in range(math.floor(S), math.floor(N) + 1)
        for lo in range(math.floor(W), math.floor(E) + 1)]
print("tiles:", len(urls))

with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
    srcs = [rasterio.open(u) for u in urls]
    arr, tr = merge(srcs, bounds=(W, S, E, N))
    for s_ in srcs:
        s_.close()
z = arr[0].astype("float32")
H, Wd = z.shape
print("DEM size:", H, "x", Wd)

path = os.path.join(OUT, "dem_mexico_city.tif")
with rasterio.open(path, "w", driver="GTiff", height=H, width=Wd, count=1, dtype="float32",
                   crs="EPSG:4326", transform=tr, compress="deflate") as dst:
    dst.write(z, 1)

# hillshade (sun from the north-west, 45 degrees up)
lat0 = (S + N) / 2
dy = abs(tr.e) * 111320.0
dx = abs(tr.a) * 111320.0 * math.cos(math.radians(lat0))
gy, gx = np.gradient(z, dy, dx)
az, alt = math.radians(315), math.radians(45)
light = np.array([math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt)])
nx, ny, nz = -gx, gy, np.ones_like(z)
norm = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
hs = np.clip((nx * light[0] + ny * light[1] + nz * light[2]) / norm, 0, 1)
plt.imsave(os.path.join(OUT, "hillshade_overlay.png"), hs, cmap="gray", vmin=0, vmax=1)

info = {
    "product": "Copernicus DEM GLO-30 (DSM)",
    "bounds_lonlat_west_south_east_north": [W, S, E, N],
    "elevation_min_m": float(np.nanmin(z)),
    "elevation_max_m": float(np.nanmax(z)),
    "note": "Surface model: includes buildings and vegetation. Heights above EGM2008 geoid.",
}
with open(os.path.join(OUT, "dem_info.json"), "w", encoding="utf-8") as f:
    json.dump(info, f, indent=2)
print(f"elevation {info['elevation_min_m']:.0f} to {info['elevation_max_m']:.0f} m -> {path}")

add_manifest("Copernicus DEM GLO-30", "ESA / Copernicus via AWS Open Data", "2021 release (data 2011-2015)",
             "30 m (1 arc-second)", "DSM, GeoTIFF",
             "Copernicus DEM licence: free, with attribution 'Contains modified Copernicus data'",
             "dem_mexico_city.tif")
"""
Step 4: look at the downloaded DISP-S1 file, clip it to the Mexico City box, save a preview.
Run:  python 04_clip_preview.py
"""
import glob
import sys

import h5py
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from pyproj import CRS, Transformer
from rasterio.transform import from_origin

W, S, E, N = -99.30, 19.20, -98.85, 19.60
files = sorted(glob.glob("raw/disp/*.nc"))
if not files:
    sys.exit("No .nc file in raw/disp")
path = files[-1]
print("File:", path)


def txt(f, key):
    v = f["identification/" + key][()]
    return v.decode() if isinstance(v, bytes) else v


with h5py.File(path, "r") as f:
    print("pass direction :", txt(f, "orbit_pass_direction"))
    print("reference date :", txt(f, "reference_datetime"))
    print("secondary date :", txt(f, "secondary_datetime"))
    print("pixel spacing m:", f["identification/product_sample_spacing"][()])
    print("look direction :", txt(f, "look_direction"))

    a = f["spatial_ref"].attrs
    wkt = a.get("crs_wkt") or a.get("spatial_ref")
    if isinstance(wkt, bytes):
        wkt = wkt.decode()
    crs = CRS.from_wkt(str(wkt)) if wkt else CRS.from_epsg(32614)
    print("CRS            :", crs.to_string())

    x = f["x"][:]
    y = f["y"][:]
    tr = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    xs, ys = tr.transform([W, E, E, W], [S, S, N, N])
    xmin, xmax, ymin, ymax = min(xs), max(xs), min(ys), max(ys)
    ix = np.where((x >= xmin) & (x <= xmax))[0]
    iy = np.where((y >= ymin) & (y <= ymax))[0]
    if len(ix) == 0 or len(iy) == 0:
        sys.exit("The box is outside this file.")
    x0, x1 = ix.min(), ix.max() + 1
    y0, y1 = iy.min(), iy.max() + 1
    print("window (rows, cols):", y1 - y0, x1 - x0)
    print("box fully inside file:", x.min() <= xmin and x.max() >= xmax and y.min() <= ymin and y.max() >= ymax)

    disp = f["displacement"][y0:y1, x0:x1]
    mask = f["recommended_mask"][y0:y1, x0:x1]
    xw, yw = x[x0:x1], y[y0:y1]

cm = disp.astype("float32") * 100.0
valid = (mask == 1) & np.isfinite(cm)
cm[~valid] = np.nan
print(f"valid pixels: {100 * valid.mean():.0f}%")
if valid.any():
    p2, p50, p98 = np.nanpercentile(cm, [2, 50, 98])
    print(f"displacement in cm (LOS): 2% = {p2:.1f}, median = {p50:.1f}, 98% = {p98:.1f}")

dx, dy = abs(xw[1] - xw[0]), abs(yw[1] - yw[0])
if yw[0] < yw[-1]:
    cm = cm[::-1]
    yw = yw[::-1]
transform = from_origin(xw[0] - dx / 2, yw[0] + dy / 2, dx, dy)
with rasterio.open(
    "raw/disp_clip_test.tif", "w", driver="GTiff", height=cm.shape[0], width=cm.shape[1],
    count=1, dtype="float32", crs=crs, transform=transform, nodata=np.nan, compress="deflate",
) as dst:
    dst.write(cm, 1)

lim = np.nanpercentile(np.abs(cm), 98) if valid.any() else 1
plt.figure(figsize=(8, 7))
plt.imshow(cm, cmap="RdBu", vmin=-lim, vmax=lim)
plt.colorbar(label="LOS displacement (cm)")
plt.title("DISP-S1 frame 20688, Mexico City box")
plt.savefig("raw/preview_disp.png", dpi=110, bbox_inches="tight")
print("Saved raw/disp_clip_test.tif and raw/preview_disp.png")
"""
Step 6: clip every downloaded OPERA DISP-S1 block to the study box, chain the blocks into one
cumulative line-of-sight (LOS) displacement series, and export small files for the web app.

The study box is taken from raw/disp_clip_test.tif (made by 04_clip_preview.py), so you do not
have to type coordinates again.

Run:  python 06_build_series.py

Outputs in out/mexico_city/:
  cumulative_YYYYMMDD.tif  cumulative LOS displacement in cm, native UTM grid (negative = away from satellite)
  overlay_YYYYMMDD.png     colour image in lon/lat, for a map image overlay
  series.json              dates, bounds, colour range, stats and time series
  preview_series.png       quick check picture
"""
import glob
import json
import os
import re

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.transform import array_bounds
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform, transform_bounds
from rasterio.windows import from_bounds as window_from_bounds

FRAME = "20688"
START_REF = "20220327"
RAW = os.path.join("raw", "disp")
CLIP_REF = os.path.join("raw", "disp_clip_test.tif")
OUT = os.path.join("out", "mexico_city")
os.makedirs(OUT, exist_ok=True)


def sub(path, name):
    return f'NETCDF:"{os.path.abspath(path)}":{name}'


# 1. choose the last product of each reference block
pat = re.compile(r"F%s_VV_(\d{8})T\d{6}Z_(\d{8})T\d{6}Z_v[\d.]+_(\d{8})T" % FRAME)
blocks = {}
for p in glob.glob(os.path.join(RAW, "*.nc")):
    m = pat.search(os.path.basename(p))
    if not m:
        continue
    ref, sec, prod = m.groups()
    if ref < START_REF:
        continue
    if ref not in blocks or (sec, prod) > blocks[ref][0]:
        blocks[ref] = ((sec, prod), p)
refs = sorted(blocks)
if not refs:
    raise SystemExit("No .nc files found in raw/disp")
print(f"{len(refs)} blocks found")
for a, b in zip(refs, refs[1:]):
    if blocks[a][0][0] != b:
        print(f"WARNING: block {a} ends {blocks[a][0][0]} but next block starts {b}; chain has a gap")

# 2. study box from the earlier clip
with rasterio.open(CLIP_REF) as c:
    clip_bounds, clip_crs = c.bounds, c.crs


def read_block(path):
    with rasterio.open(sub(path, "displacement")) as ds:
        crs = ds.crs or clip_crs
        b = transform_bounds(clip_crs, crs, *clip_bounds)
        win = window_from_bounds(*b, transform=ds.transform).round_offsets().round_lengths()
        disp = ds.read(1, window=win).astype("float32")
        tr = ds.window_transform(win)
    try:
        with rasterio.open(sub(path, "recommended_mask")) as ms:
            mask = ms.read(1, window=win)
        disp = np.where(mask == 1, disp, np.nan).astype("float32")
    except Exception as e:
        print("   (no recommended_mask used:", e, ")")
    return disp, tr, crs


# 3. chain the blocks
dates = [START_REF]
cums = []
cum = None
transform_ref = crs_ref = None
for ref in refs:
    (sec, _), path = blocks[ref]
    print(f"reading {os.path.basename(path)}")
    disp, tr, crs = read_block(path)
    if cum is None:
        cum = np.zeros_like(disp)
        transform_ref, crs_ref = tr, crs
        cums.append(cum.copy())
    elif disp.shape != cum.shape:
        raise SystemExit(f"Grid size changed in block {ref}: {disp.shape} vs {cum.shape}")
    cum = cum + disp  # NaN in any block makes the pixel NaN afterwards
    dates.append(sec)
    cums.append(cum.copy())

H, W = cums[0].shape
cm = [c * 100.0 for c in cums]  # metres -> cm
final = cm[-1]
valid_all = np.isfinite(final)
print(f"grid {H} x {W}, pixels valid in every block: {valid_all.mean() * 100:.1f}%")
if valid_all.mean() < 0.05:
    print("WARNING: very few valid pixels. Check the mask or the box before using these results.")

# 4. colour range shared by all frames
lim = float(np.nanpercentile(np.abs(final[valid_all]), 98)) if valid_all.any() else 5.0
lim = max(1.0, round(lim))

# 5. write GeoTIFFs and lon/lat overlays
west_e = None
for d, arr in zip(dates, cm):
    with rasterio.open(
        os.path.join(OUT, f"cumulative_{d}.tif"), "w", driver="GTiff", height=H, width=W, count=1,
        dtype="float32", crs=crs_ref, transform=transform_ref, nodata=np.nan, compress="deflate",
    ) as dst:
        dst.write(arr.astype("float32"), 1)

    native_b = array_bounds(H, W, transform_ref)
    dt, dw, dh = calculate_default_transform(crs_ref, "EPSG:4326", W, H, *native_b)
    ll = np.full((dh, dw), np.nan, dtype="float32")
    reproject(arr.astype("float32"), ll, src_transform=transform_ref, src_crs=crs_ref,
              dst_transform=dt, dst_crs="EPSG:4326", src_nodata=np.nan, dst_nodata=np.nan,
              resampling=Resampling.nearest)
    rgba = plt.get_cmap("RdBu")((np.clip(ll, -lim, lim) + lim) / (2 * lim))
    rgba[~np.isfinite(ll), 3] = 0.0
    plt.imsave(os.path.join(OUT, f"overlay_{d}.png"), rgba)
    west_e = array_bounds(dh, dw, dt)  # west, south, east, north

# 6. numbers for the app
t0 = np.datetime64(f"{dates[0][:4]}-{dates[0][4:6]}-{dates[0][6:]}")
t1 = np.datetime64(f"{dates[-1][:4]}-{dates[-1][4:6]}-{dates[-1][6:]}")
years = float((t1 - t0).astype(int)) / 365.25

idx = np.flatnonzero(valid_all.ravel())
n_zone = max(1, int(len(idx) * 0.01))
order = idx[np.argsort(final.ravel()[idx])]  # most negative first
zone = order[:n_zone]
zone_series = [float(np.nanmean(a.ravel()[zone])) for a in cm]
median_series = [float(np.nanmedian(a[valid_all])) if valid_all.any() else None for a in cm]
hot = int(order[0])
r, c = divmod(hot, W)
x, y = transform_ref * (c + 0.5, r + 0.5)
lon, lat = transform(crs_ref, "EPSG:4326", [x], [y])

info = {
    "area": "Mexico City",
    "product": "OPERA L3 DISP-S1, frame %s, VV, chained last product of each reference block" % FRAME,
    "units": "cm, line of sight, negative = moving away from satellite",
    "caveat": "Relative to a reference point; atmosphere not fully corrected; blocks are chained by summation.",
    "dates": dates,
    "bounds_lonlat_west_south_east_north": list(west_e),
    "color_range_cm": [-lim, lim],
    "valid_pixel_fraction": float(valid_all.mean()),
    "mean_rate_cm_per_year_fastest_1pct": zone_series[-1] / years if years else None,
    "series_fastest_1pct_cm": zone_series,
    "series_scene_median_cm": median_series,
    "fastest_pixel_lonlat": [float(lon[0]), float(lat[0])],
    "fastest_pixel_final_cm": float(final.ravel()[hot]),
}
with open(os.path.join(OUT, "series.json"), "w", encoding="utf-8") as f:
    json.dump(info, f, indent=2)

# 7. preview
fig, ax = plt.subplots(1, 2, figsize=(12, 5))
im = ax[0].imshow(final, cmap="RdBu", vmin=-lim, vmax=lim)
ax[0].set_title(f"Cumulative LOS displacement, cm\n{dates[0]} to {dates[-1]}")
fig.colorbar(im, ax=ax[0], shrink=0.8)
ax[1].plot(dates, zone_series, marker="o", label="fastest 1% of pixels")
ax[1].plot(dates, median_series, marker="o", label="scene median")
ax[1].set_ylabel("cm"); ax[1].tick_params(axis="x", rotation=45); ax[1].legend()
ax[1].set_title("Time series (relative to first date)")
fig.tight_layout()
fig.savefig(os.path.join(OUT, "preview_series.png"), dpi=120)

print(f"Done. Fastest 1% zone: {zone_series[-1]:.1f} cm over {years:.1f} years "
      f"(~{zone_series[-1] / years:.1f} cm/yr LOS). Files are in {OUT}")
"""Shared helpers for the TerraWatch data scripts (07 onward). Keep this file next to them in NSAC/."""
import csv
import datetime
import os

import rasterio
from rasterio.warp import transform_bounds

REF = os.path.join("raw", "disp_clip_test.tif")      # the study box made by 04_clip_preview.py
MANIFEST = os.path.join("raw", "manifest.csv")


def box_wgs84():
    """Study box as (west, south, east, north) in lon/lat."""
    with rasterio.open(REF) as c:
        return transform_bounds(c.crs, "EPSG:4326", *c.bounds)


def add_manifest(name, source, published, resolution, product, licence, path):
    """Append one row to raw/manifest.csv (source, date, resolution, product type, licence)."""
    os.makedirs("raw", exist_ok=True)
    new = not os.path.exists(MANIFEST)
    with open(MANIFEST, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["name", "source", "published_or_acquired", "resolution",
                        "product_type", "licence", "file", "downloaded_on"])
        w.writerow([name, source, published, resolution, product, licence, path,
                    datetime.date.today().isoformat()])
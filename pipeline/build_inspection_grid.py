"""Create a small geographic inspection grid from exported cumulative GeoTIFFs.

Usage:
  python pipeline/build_inspection_grid.py --input-dir ../out/mexico_city --output data/samples/mexico_city/inspection_grid.json

Requires rasterio and numpy. The source rasters remain outside the repository;
the generated, decimated JSON grid is suitable for approximate point lookup.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import calculate_default_transform, reproject


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stride", type=int, default=8)
    args = parser.parse_args()
    files = sorted(args.input_dir.glob("cumulative_*.tif"))
    if not files:
        raise SystemExit(f"No cumulative_*.tif files found in {args.input_dir}")
    if args.stride < 1:
        raise SystemExit("--stride must be at least 1")

    with rasterio.open(files[0]) as source:
        width = max(1, math.ceil(source.width / args.stride))
        height = max(1, math.ceil(source.height / args.stride))
        bounds = source.bounds
        transform, width, height = calculate_default_transform(
            source.crs, "EPSG:4326", source.width, source.height,
            bounds.left, bounds.bottom, bounds.right, bounds.top,
            dst_width=width, dst_height=height,
        )
    frames = []
    for filename in files:
        with rasterio.open(filename) as source:
            destination = np.full((height, width), np.nan, dtype=np.float32)
            reproject(
                source=rasterio.band(source, 1), destination=destination,
                src_transform=source.transform, src_crs=source.crs,
                src_nodata=source.nodata, dst_transform=transform,
                dst_crs="EPSG:4326", dst_nodata=np.nan,
                resampling=Resampling.nearest,
            )
        frames.append({
            "date": filename.stem.removeprefix("cumulative_"),
            "values_cm": [[round(float(value), 2) if np.isfinite(value) else None for value in row] for row in destination],
        })
    west = transform.c
    north = transform.f
    east = west + width * transform.a
    south = north + height * transform.e
    result = {
        "units": "cm line-of-sight displacement relative to a reference point",
        "sampling": f"Nearest valid raster sample on an approximately {args.stride}x decimated geographic grid; point lookup is approximate.",
        "bounds_lonlat_west_south_east_north": [west, south, east, north],
        "width": width,
        "height": height,
        "dates": [frame["date"] for frame in frames],
        "frames": frames,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {width}x{height} grid with {len(frames)} dates to {args.output}")


if __name__ == "__main__":
    main()

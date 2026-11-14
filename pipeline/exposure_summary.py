"""Summarize facilities and road length by sampled cumulative LOS class.

This helper does not report damage or risk. It is ready for use when OSM
GeoJSON exports and a cumulative GeoTIFF are available.
"""
import argparse
import json
import math
from pathlib import Path

import rasterio
from rasterio.transform import rowcol
from rasterio.warp import transform as transform_coordinates


CLASSES = ("lt_5_cm", "5_to_20_cm", "20_to_50_cm", "gt_50_cm", "no_reliable_data")


def class_for(value):
    if value is None or not math.isfinite(value):
        return "no_reliable_data"
    magnitude = abs(value)
    if magnitude < 5:
        return "lt_5_cm"
    if magnitude < 20:
        return "5_to_20_cm"
    if magnitude < 50:
        return "20_to_50_cm"
    return "gt_50_cm"


def sample_lonlat(dataset, raster, coordinates):
    if not coordinates:
        return []
    xs, ys = transform_coordinates("EPSG:4326", dataset.crs, [p[0] for p in coordinates], [p[1] for p in coordinates])
    rows, cols = rowcol(dataset.transform, xs, ys)
    samples = []
    for row, col in zip(rows, cols):
        if row < 0 or col < 0 or row >= dataset.height or col >= dataset.width:
            samples.append(None)
            continue
        value = float(raster[row, col])
        samples.append(value if math.isfinite(value) else None)
    return samples


def haversine_m(a, b):
    radius = 6_371_008.8
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(h))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raster", required=True, type=Path, help="Final cumulative_YYYYMMDD.tif")
    parser.add_argument("--facilities", required=True, type=Path)
    parser.add_argument("--roads", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--spacing-m", default=100, type=float)
    args = parser.parse_args()
    if args.spacing_m <= 0:
        raise SystemExit("--spacing-m must be positive")

    facilities = json.loads(args.facilities.read_text(encoding="utf-8"))["features"]
    roads = json.loads(args.roads.read_text(encoding="utf-8"))["features"]
    facility_counts = {key: 0 for key in CLASSES}
    facility_categories = {}
    road_length_m = {key: 0.0 for key in CLASSES}

    with rasterio.open(args.raster) as dataset:
        raster = dataset.read(1)
        for feature in facilities:
            if feature.get("geometry", {}).get("type") != "Point":
                continue
            value = sample_lonlat(dataset, raster, [feature["geometry"]["coordinates"]])[0]
            category = class_for(value)
            facility_counts[category] += 1
            name = feature.get("properties", {}).get("category", "uncategorized")
            facility_categories.setdefault(name, {key: 0 for key in CLASSES})[category] += 1

        for feature in roads:
            geometry = feature.get("geometry", {})
            if geometry.get("type") != "LineString":
                continue
            coordinates = geometry.get("coordinates", [])
            samples, weights = [], []
            for start, end in zip(coordinates, coordinates[1:]):
                length = haversine_m(start, end)
                pieces = max(1, math.ceil(length / args.spacing_m))
                for i in range(pieces):
                    fraction = (i + 0.5) / pieces
                    samples.append([start[0] + fraction * (end[0] - start[0]), start[1] + fraction * (end[1] - start[1])])
                    weights.append(length / pieces)
            values = sample_lonlat(dataset, raster, samples)
            for value, weight in zip(values, weights):
                road_length_m[class_for(value)] += weight

    result = {
        "date": args.raster.stem.removeprefix("cumulative_"),
        "units": "cumulative line-of-sight displacement in cm",
        "interpretation": "Counts and lengths are located in areas with measured LOS displacement; they are not damage or risk estimates.",
        "sampling": f"Nearest raster pixel for facilities; road segments sampled at up to {args.spacing_m:g} m spacing and length apportioned to samples.",
        "facilities": {"total": sum(facility_counts.values()), "by_class": facility_counts, "by_category": facility_categories},
        "roads": {"total_km": round(sum(road_length_m.values()) / 1000, 3), "length_km_by_class": {key: round(value / 1000, 3) for key, value in road_length_m.items()}},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"Wrote LOS exposure summary to {args.output}")


if __name__ == "__main__":
    main()

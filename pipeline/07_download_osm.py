"""
Step 7: download roads and key facilities for the study box from OpenStreetMap (Overpass API).

Roads: motorway, trunk, primary, secondary (tertiary left out to keep the download light).
Facilities: hospitals, fire stations, schools, metro stations, water/wastewater infrastructure.
(Buildings are NOT downloaded here: there are too many for Overpass. They come in a later step.)

Run:  python 07_download_osm.py
Outputs: out/mexico_city/context/roads.geojson, facilities.geojson
"""
import hashlib
import json
import os
import time

import requests

from tw_common import add_manifest, box_wgs84

OUT = os.path.join("out", "mexico_city", "context")
os.makedirs(OUT, exist_ok=True)
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
HEADERS = {"User-Agent": "TerraWatch-NSAC-hackathon/0.1 (student project; python-requests)",
           "Accept": "application/json"}
W, S, E, N = box_wgs84()


def tiles(nx=3, ny=3):
    xs = [W + (E - W) * i / nx for i in range(nx + 1)]
    ys = [S + (N - S) * j / ny for j in range(ny + 1)]
    for i in range(nx):
        for j in range(ny):
            yield ys[j], xs[i], ys[j + 1], xs[i + 1]  # south, west, north, east


CACHE = os.path.join("raw", "osm_cache")
os.makedirs(CACHE, exist_ok=True)


def run(query):
    # every finished answer is saved, so rerunning the script skips work already done
    key = os.path.join(CACHE, hashlib.md5(query.encode()).hexdigest() + ".json")
    if os.path.exists(key):
        with open(key, encoding="utf-8") as f:
            return json.load(f)
    for attempt in range(1, 4):
        for url in ENDPOINTS:
            try:
                r = requests.post(url, data={"data": query}, headers=HEADERS, timeout=300)
                if r.status_code == 200:
                    data = r.json()
                    with open(key, "w", encoding="utf-8") as f:
                        json.dump(data, f)
                    return data
                print("   status", r.status_code, "from", url)
            except Exception as ex:
                print("   problem:", ex)
        time.sleep(30 * attempt)
    raise SystemExit("Overpass did not answer. Try again in a few minutes.")


roads = {}
facilities = {}
for k, (s_, w_, n_, e_) in enumerate(tiles(), 1):
    bb = f"{s_},{w_},{n_},{e_}"
    print(f"tile {k}/9: roads")
    q = f'[out:json][timeout:240];way["highway"~"^(motorway|trunk|primary|secondary)$"]({bb});out geom tags;'
    for el in run(q).get("elements", []):
        if el["type"] == "way" and el.get("geometry"):
            t = el.get("tags", {})
            roads[el["id"]] = {
                "type": "Feature",
                "properties": {"id": el["id"], "highway": t.get("highway"), "name": t.get("name"), "ref": t.get("ref")},
                "geometry": {"type": "LineString", "coordinates": [[p["lon"], p["lat"]] for p in el["geometry"]]},
            }
    print(f"tile {k}/9: facilities")
    q = (f'[out:json][timeout:240];('
         f'nwr["amenity"~"^(hospital|fire_station|school)$"]({bb});'
         f'nwr["railway"="station"]["station"="subway"]({bb});'
         f'nwr["man_made"~"^(water_tower|water_works|wastewater_plant|pumping_station|reservoir_covered)$"]({bb});'
         f');out center tags;')
    for el in run(q).get("elements", []):
        t = el.get("tags", {})
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None:
            continue
        if t.get("amenity") in ("hospital", "fire_station", "school"):
            cat = t["amenity"]
        elif t.get("railway") == "station":
            cat = "metro_station"
        else:
            cat = t.get("man_made", "water_infrastructure")
        facilities[(el["type"], el["id"])] = {
            "type": "Feature",
            "properties": {"id": el["id"], "category": cat, "name": t.get("name")},
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        }
    time.sleep(5)

for name, store in (("roads", roads), ("facilities", facilities)):
    path = os.path.join(OUT, f"{name}.geojson")
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": list(store.values())}, f)
    print(f"{name}: {len(store)} features, {os.path.getsize(path) / 1e6:.1f} MB -> {path}")

cats = {}
for ft in facilities.values():
    c = ft["properties"]["category"]
    cats[c] = cats.get(c, 0) + 1
print("facilities by category:", cats)

add_manifest("OSM roads", "OpenStreetMap via Overpass API", "continuously updated", "vector",
             "roads (motorway to secondary)", "ODbL 1.0, (c) OpenStreetMap contributors", "roads.geojson")
add_manifest("OSM facilities", "OpenStreetMap via Overpass API", "continuously updated", "vector",
             "hospitals, schools, fire stations, metro stations, water infrastructure",
             "ODbL 1.0, (c) OpenStreetMap contributors", "facilities.geojson")
"""
Step 1: find OPERA DISP-S1 (Sentinel-1 surface displacement) products over the Mexico City AOI.
Uses NASA's public CMR catalogue (no login needed). Does NOT download any data.

Run from your project folder:   python 01_find_disp.py
Output: prints a summary and saves raw/disp_granules.csv
"""
import csv
import os
import re
import sys
from collections import defaultdict

import requests

CMR = "https://cmr.earthdata.nasa.gov/search"
W, S, E, N = -99.30, 19.20, -98.85, 19.60  # keep identical to aoi.geojson


def get(url, params):
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


# 1) Find the collection instead of guessing its short name
entries = get(f"{CMR}/collections.json", {"keyword": "OPERA DISP-S1", "page_size": 20})["feed"]["entry"]
print("Collections matching 'OPERA DISP-S1':")
for c in entries:
    print(f"  - {c.get('short_name')} | v{c.get('version_id')} | {c.get('title')}")

candidates = [
    c for c in entries
    if "DISP-S1" in (c.get("short_name") or "") and "STATIC" not in (c.get("short_name") or "").upper()
]
if not candidates:
    sys.exit("No DISP-S1 collection found. Copy the list above and send it to me.")

col = candidates[0]
print(f"\nUsing: {col['short_name']} (concept id {col['id']})")

# 2) Find all granules intersecting the AOI
granules, page = [], 1
while True:
    data = get(
        f"{CMR}/granules.json",
        {
            "collection_concept_id": col["id"],
            "bounding_box": f"{W},{S},{E},{N}",
            "page_size": 2000,
            "page_num": page,
            "sort_key": "start_date",
        },
    )["feed"]["entry"]
    if not data:
        break
    granules += data
    page += 1

print(f"Granules found over the AOI: {len(granules)}")
if not granules:
    sys.exit("Nothing found. Send me the output above.")

# 3) Summarise per frame and save
rows = []
by_frame = defaultdict(list)
for g in granules:
    title = g.get("title", "")
    m = re.search(r"_F(\d+)_", title)
    frame = m.group(1) if m else "unknown"
    urls = [
        l["href"] for l in g.get("links", [])
        if l.get("rel", "").endswith("/data#") and l.get("href", "").startswith("https")
    ]
    row = {
        "frame": frame,
        "title": title,
        "start": g.get("time_start", ""),
        "end": g.get("time_end", ""),
        "size_mb": g.get("granule_size", ""),
        "url": urls[0] if urls else "",
    }
    rows.append(row)
    by_frame[frame].append(row)

print("\nPer frame:")
for frame, items in sorted(by_frame.items()):
    sizes = [float(i["size_mb"]) for i in items if i["size_mb"]]
    avg = sum(sizes) / len(sizes) if sizes else 0
    print(f"  frame {frame}: {len(items)} granules, {items[0]['start'][:10]} -> {items[-1]['start'][:10]}, avg ~{avg:.0f} MB each")

os.makedirs("raw", exist_ok=True)
with open("raw/disp_granules.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
print("\nSaved raw/disp_granules.csv  (nothing downloaded yet)")
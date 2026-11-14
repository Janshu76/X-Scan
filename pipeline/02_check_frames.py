"""
Step 2: which frame covers the Mexico City AOI best, and how do reference dates work?
No downloads. Public CMR catalogue only.
"""
import re
from collections import defaultdict, Counter

import requests
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

CMR = "https://cmr.earthdata.nasa.gov/search"
CONCEPT = "C3294057315-ASF"
W, S, E, N = -99.30, 19.20, -98.85, 19.60
aoi = box(W, S, E, N)


def get(url, params):
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


granules, page = [], 1
while True:
    data = get(f"{CMR}/granules.json", {
        "collection_concept_id": CONCEPT, "bounding_box": f"{W},{S},{E},{N}",
        "page_size": 2000, "page_num": page, "sort_key": "start_date"})["feed"]["entry"]
    if not data:
        break
    granules += data
    page += 1


def footprint(g):
    polys = []
    for ring in g.get("polygons") or []:
        for s in ring:
            n = [float(x) for x in s.split()]
            pts = [(n[i + 1], n[i]) for i in range(0, len(n) - 1, 2)]
            if len(pts) >= 3:
                polys.append(Polygon(pts).buffer(0))
    for b in g.get("boxes") or []:
        s_, w_, n_, e_ = [float(x) for x in b.split()]
        polys.append(box(w_, s_, e_, n_))
    return unary_union(polys) if polys else None


by_frame = defaultdict(list)
for g in granules:
    m = re.search(r"_F(\d+)_", g.get("title", ""))
    by_frame[m.group(1) if m else "unknown"].append(g)

print(f"Total granules: {len(granules)}\n")
for frame, items in sorted(by_frame.items()):
    last = items[-1]
    fp = footprint(last)
    cov = f"{100 * fp.intersection(aoi).area / aoi.area:.0f}%" if fp is not None else "footprint not found"
    refs = Counter()
    for g in items:
        d = re.findall(r"(\d{8}T\d{6}Z)", g.get("title", ""))
        if len(d) >= 2:
            refs[d[0][:8]] += 1
    print(f"Frame {frame}: AOI coverage {cov}")
    print(f"  example title: {last.get('title')}")
    print(f"  distinct reference dates: {len(refs)}")
    for ref, count in sorted(refs.items()):
        print(f"    reference {ref}: {count} products")
    print()

print("Keys in one granule record (in case footprints are missing):")
print(sorted(granules[0].keys()))
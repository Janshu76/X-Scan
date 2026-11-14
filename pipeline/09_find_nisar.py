"""
Step 9: find out which NISAR products exist over the study box (search only, nothing is downloaded).

Needs a recent asf_search.  If it complains about NISAR, run:  pip install -U asf_search
Run:  python 09_find_nisar.py
Output: raw/nisar_granules.csv and a summary on screen.
"""
import csv
import os
import sys

import asf_search as asf

from tw_common import box_wgs84

W, S, E, N = box_wgs84()
wkt = f"POLYGON(({W} {S},{E} {S},{E} {N},{W} {N},{W} {S}))"
try:
    dataset = asf.DATASET.NISAR
except AttributeError:
    sys.exit("This asf_search version has no NISAR support. Run: pip install -U asf_search")

print("searching ASF for NISAR over the box ...")
res = asf.search(dataset=dataset, intersectsWith=wkt, maxResults=2000)
keys = ("fileID", "processingLevel", "startTime", "flightDirection", "pathNumber", "frameNumber", "bytes", "url")
rows = [{k: r.properties.get(k) for k in keys} for r in res]
if not rows:
    sys.exit("No NISAR granules found over this box.")

os.makedirs("raw", exist_ok=True)
with open(os.path.join("raw", "nisar_granules.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=keys)
    w.writeheader()
    w.writerows(rows)

by = {}
for r in rows:
    by.setdefault(r["processingLevel"], []).append(r)
print(f"{len(rows)} granules found")
for lvl, items in sorted(by.items(), key=lambda kv: str(kv[0])):
    dates = sorted(str(i["startTime"])[:10] for i in items)
    dirs = sorted({str(i["flightDirection"]) for i in items})
    print(f"  {lvl}: {len(items)} granules, {dates[0]} to {dates[-1]}, {', '.join(dirs)}")
print("Saved raw/nisar_granules.csv. Paste this summary to Claude before downloading anything.")
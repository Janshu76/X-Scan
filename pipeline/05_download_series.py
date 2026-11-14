"""
Step 5: download the LAST product of each reference block for frame 20688 (from START_REF on).
Skips files you already have. Asks before downloading. Needs your Earthdata login (typed, hidden).

Run:  python 05_download_series.py
"""
import csv
import getpass
import os
import re
import sys
import time

import asf_search as asf

FRAME = "20688"
START_REF = "20220327"   # first reference block to include (YYYYMMDD)
OUT = os.path.join("raw", "disp")

blocks = {}
for r in csv.DictReader(open("raw/disp_granules.csv", encoding="utf-8")):
    if r["frame"] != FRAME:
        continue
    d = re.findall(r"_(\d{8})T\d{6}Z", r["title"])
    if len(d) < 3 or d[0] < START_REF or not r["url"]:
        continue
    key = d[0]
    rank = (d[1], d[2])  # latest secondary date, then latest production date
    if key not in blocks or rank > blocks[key][0]:
        blocks[key] = (rank, r)

picks = [blocks[k][1] for k in sorted(blocks)]
if not picks:
    sys.exit("Nothing selected. Tell me.")

total = 0.0
print(f"{len(picks)} files (last product of each block):")
for r in picks:
    fname = r["url"].split("/")[-1]
    have = os.path.exists(os.path.join(OUT, fname))
    size = float(r["size_mb"])
    total += 0 if have else size
    d = re.findall(r"_(\d{8})T\d{6}Z", r["title"])
    print(f"  ref {d[0]} -> secondary {d[1]}  {size:.0f} MB  {'[already downloaded]' if have else ''}")
print(f"To download: ~{total / 1000:.1f} GB")
if total == 0:
    sys.exit("Everything is already here.")
if input("Start downloading? (y/n): ").strip().lower() != "y":
    sys.exit("Cancelled.")

os.makedirs(OUT, exist_ok=True)
session = asf.ASFSession()
session.auth_with_creds(input("Earthdata username: "), getpass.getpass("Earthdata password (hidden): "))

for i, r in enumerate(picks, 1):
    fname = r["url"].split("/")[-1]
    final = os.path.join(OUT, fname)
    if os.path.exists(final):
        continue
    part = fname + ".part"
    for attempt in range(1, 4):
        try:
            print(f"[{i}/{len(picks)}] downloading {fname} (attempt {attempt})")
            asf.download_url(url=r["url"], path=OUT, filename=part, session=session)
            got = os.path.getsize(os.path.join(OUT, part)) / 1e6
            if got < 0.9 * float(r["size_mb"]):
                raise RuntimeError(f"file too small ({got:.0f} MB)")
            os.replace(os.path.join(OUT, part), final)
            print(f"    done, {got:.0f} MB")
            break
        except Exception as e:
            print("    problem:", e)
            time.sleep(5)
    else:
        print("    giving up on this file; run the script again later")

print("Finished. Run the script again if any file was skipped.")
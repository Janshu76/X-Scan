"""
Step 3: download ONE OPERA DISP-S1 product (frame 20688) and print what is inside it.
Reads raw/disp_granules.csv (made by step 1). Asks before downloading.
Needs your NASA Earthdata login (typed in the terminal, never saved).

Run:  python 03_download_one.py
"""
import csv
import getpass
import os
import re
import sys

import asf_search as asf
import h5py

FRAME = "20688"
REF_BLOCK = "20250416"   # reference date of the block we pick from

rows = [r for r in csv.DictReader(open("raw/disp_granules.csv", encoding="utf-8")) if r["frame"] == FRAME]
block = []
for r in rows:
    d = re.findall(r"_(\d{8})T\d{6}Z", r["title"])
    if len(d) >= 2 and d[0] == REF_BLOCK:
        block.append((d[1], r))
if not block:
    sys.exit("No products found for that reference date. Tell me.")
block.sort(key=lambda x: x[0])
sec, pick = block[-1]
print(f"Products in this block: {len(block)}  (secondary dates {block[0][0]} -> {block[-1][0]})")
print(f"Picked: {pick['title']}")
print(f"Size: ~{pick['size_mb']} MB")
if input("Download it? (y/n): ").strip().lower() != "y":
    sys.exit("Cancelled.")

os.makedirs("raw/disp", exist_ok=True)
fname = pick["url"].split("/")[-1]
path = os.path.join("raw", "disp", fname)
if not os.path.exists(path):
    session = asf.ASFSession()
    session.auth_with_creds(input("Earthdata username: "), getpass.getpass("Earthdata password (hidden): "))
    asf.download_url(url=pick["url"], path="raw/disp", filename=fname, session=session)
print("Saved:", path, f"({os.path.getsize(path) / 1e6:.0f} MB)\n")

print("=== Inside the file ===")
with h5py.File(path, "r") as f:
    def show(name, obj):
        if isinstance(obj, h5py.Dataset):
            print(f"{name}  shape={obj.shape} dtype={obj.dtype}")
            for k in ("units", "long_name", "description"):
                if k in obj.attrs:
                    v = obj.attrs[k]
                    print(f"      {k}: {v.decode() if isinstance(v, bytes) else v}")
    f.visititems(show)
    print("\nTop-level attributes:", dict(list(f.attrs.items())[:15]))
"""
Step 10: find GNSS (GPS) stations inside the study box from the Nevada Geodetic Laboratory (free, no login)
and download their daily position time series, so InSAR can be checked against independent measurements.

Output: out/mexico_city/context/gnss.json  (station lat/lon, vertical rate, vertical series in cm)
Raw files: raw/gnss/<STATION>.tenv3

Run:  python 10_gnss_stations.py
Please cite: Blewitt, Hammond & Kreemer (2018), GPS Time Series Products, Nevada Geodetic Laboratory.
"""
import datetime
import json
import os

import numpy as np
import requests

from tw_common import add_manifest, box_wgs84

W, S, E, N = box_wgs84()
PAD = 0.05
os.makedirs(os.path.join("raw", "gnss"), exist_ok=True)
OUT = os.path.join("out", "mexico_city", "context")
os.makedirs(OUT, exist_ok=True)


def get(urls):
    for u in urls:
        try:
            r = requests.get(u, timeout=120)
            if r.status_code == 200 and len(r.text) > 200:
                return r.text, u
        except Exception:
            pass
    return None, None


txt, src = get(["https://geodesy.unr.edu/NGLStationPages/DataHoldings.txt",
                "http://geodesy.unr.edu/NGLStationPages/DataHoldings.txt"])
if txt is None:
    raise SystemExit("Could not download the NGL station list. Try again later.")

stations = []
for line in txt.splitlines()[1:]:
    p = line.split()
    if len(p) < 3:
        continue
    try:
        lat, lon = float(p[1]), float(p[2])
    except ValueError:
        continue
    if lon > 180:
        lon -= 360
    if S - PAD <= lat <= N + PAD and W - PAD <= lon <= E + PAD:
        stations.append((p[0], lat, lon))
print(f"{len(stations)} NGL stations in/near the box:", ", ".join(s[0] for s in stations) or "none")
if not stations:
    raise SystemExit("No stations found. Tell Claude; the box may need widening.")

out = []
for sta, lat, lon in stations:
    body, used = get([f"https://geodesy.unr.edu/gps_timeseries/tenv3/IGS20/{sta}.tenv3",
                      f"https://geodesy.unr.edu/gps_timeseries/tenv3/IGS14/{sta}.tenv3",
                      f"http://geodesy.unr.edu/gps_timeseries/tenv3/IGS14/{sta}.tenv3"])
    if body is None:
        print(f"  {sta}: no time series file found, skipped")
        continue
    open(os.path.join("raw", "gnss", f"{sta}.tenv3"), "w", encoding="utf-8").write(body)
    t, up = [], []
    for line in body.splitlines()[1:]:
        p = line.split()
        if len(p) < 14:
            continue
        try:
            mjd = float(p[3])
            up.append((float(p[12]) + float(p[13])) * 100.0)  # up + antenna offset, metres -> cm
            t.append(float(p[2]))
        except ValueError:
            continue
    if len(t) < 30:
        print(f"  {sta}: too few points, skipped")
        continue
    t, up = np.array(t), np.array(up)
    rate_all = float(np.polyfit(t, up, 1)[0])
    m = t >= 2022.2
    rate_recent = float(np.polyfit(t[m], up[m], 1)[0]) if m.sum() > 30 else None
    step = max(1, len(t) // 400)
    out.append({
        "station": sta, "lat": lat, "lon": lon, "source_file": used,
        "first_year": float(t[0]), "last_year": float(t[-1]),
        "vertical_rate_cm_per_year_all": rate_all,
        "vertical_rate_cm_per_year_since_2022": rate_recent,
        "series_decimal_year": [round(float(x), 3) for x in t[::step]],
        "series_up_cm": [round(float(x - up[0]), 2) for x in up[::step]],
    })
    r2 = f"{rate_recent:.1f}" if rate_recent is not None else "n/a"
    print(f"  {sta}: {len(t)} days, vertical rate {rate_all:.1f} cm/yr (since 2022: {r2})")

with open(os.path.join(OUT, "gnss.json"), "w", encoding="utf-8") as f:
    json.dump({"source": "Nevada Geodetic Laboratory", "units": "cm, vertical (positive = up)",
               "stations": out}, f, indent=1)
add_manifest("GNSS time series", "Nevada Geodetic Laboratory (geodesy.unr.edu)", "daily, up to present",
             "point measurements, daily", "GNSS station position time series (tenv3)",
             "Free to use; cite Blewitt et al. 2018", "raw/gnss/*.tenv3")
print("Saved out/mexico_city/context/gnss.json")
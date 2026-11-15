"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const root = "/data/regions/mexico_city";
type GnssCheck = { note?: string; stations?: { station: string; gnss_vertical_cm_per_year: number; insar_los_cm_per_year: number; coverage: string }[] };
type Granules = { total_granules?: number; groups?: { product_type: string; direction: string; count: number; date_start: string; date_end: string }[] };

async function optionalJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${root}/${path}`);
  return response.ok ? response.json() as Promise<T> : null;
}

export default function ContextEvidencePanel() {
  const [gnss, setGnss] = useState<GnssCheck | null>(null);
  const [gnssSource, setGnssSource] = useState<"v3" | "v2" | null>(null);
  const [nisar, setNisar] = useState<Granules | null>(null);
  const [demAvailable, setDemAvailable] = useState(false);
  const [previews, setPreviews] = useState(false);

  useEffect(() => {
    Promise.all([
      optionalJson<GnssCheck>("context/gnss_vs_insar_v3.json").then(async (value) => { if (value) { setGnssSource("v3"); return value; } const fallback = await optionalJson<GnssCheck>("context/gnss_vs_insar_v2.json"); if (fallback) setGnssSource("v2"); return fallback; }),
      optionalJson<Granules>("nisar/granules_summary.json"),
      fetch(`${root}/context/dem_info.json`).then((response) => setDemAvailable(response.ok)).catch(() => setDemAvailable(false)),
      Promise.all([fetch(`${root}/nisar/pair2_preview.png`), fetch(`${root}/nisar/aoi_crop_pair2.png`)]).then((responses) => setPreviews(responses.every((response) => response.ok))).catch(() => setPreviews(false)),
    ]).then(([check, summary]) => { setGnss(check); setNisar(summary); }).catch(() => undefined);
  }, []);

  return <section className="card context-evidence-card">
    <div className="card-top"><span className="section-kicker">CONTEXT DATA</span><span className="status-tag muted">MEASURED · APPROXIMATE</span></div>
    <div className="context-evidence-grid">
      <article><b>GNSS cross-check</b><p>{gnss ? `${gnss.stations?.length ?? 0} stations compared. Two quiet stations were used for the adjustment check; the station comparison is an independent approximate check.` : "GNSS comparison is NOT ADDED."}</p><small>{gnss ? `Using ${gnssSource ?? "available"}${gnssSource === "v2" ? " fallback; gnss_vs_insar_v3.json is NOT ADDED" : ""}. ${gnss.note ?? "GNSS vertical motion and InSAR line-of-sight motion are different measurements."}` : ""}</small></article>
      <article><b>Terrain</b><p>{demAvailable ? "Copernicus DEM summary and hillshade preview are available." : "Terrain context is NOT ADDED."}</p><small>Context only; not used to calculate the displacement series.</small></article>
      <article><b>Roads and facilities</b><p>NOT ADDED. No exposure counts or lengths are calculated.</p><small>Observed motion does not establish damage or risk.</small></article>
      <article><b>NISAR coverage search</b><p>{nisar ? `${nisar.total_granules ?? 0} search granules summarized by product, orbit direction, and date range.` : "NISAR search summary is NOT ADDED."}</p><small>PROVISIONAL SAR lab context only; NISAR is not the source of the displayed subsidence.</small>{previews && <div className="nisar-preview-row"><Image unoptimized width={320} height={180} src={`${root}/nisar/aoi_crop_pair2.png`} alt="NISAR AOI crop preview"/><Image unoptimized width={320} height={180} src={`${root}/nisar/pair2_preview.png`} alt="NISAR pair preview"/></div>}</article>
    </div>
  </section>;
}

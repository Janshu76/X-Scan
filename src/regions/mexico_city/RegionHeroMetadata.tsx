"use client";

import { useEffect, useState } from "react";

type Metadata = { dates?: string[]; common_reference_window?: { lat: number; lon: number } };

export default function RegionHeroMetadata({ coordinateOnly = false }: { coordinateOnly?: boolean }) {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  useEffect(() => {
    fetch("/data/regions/mexico_city/pack_summary.json").then((response) => response.ok ? response.json() as Promise<Metadata> : null).then(setMetadata).catch(() => setMetadata(null));
  }, []);
  const dates = metadata?.dates ?? [];
  const first = dates[0] ? new Date(`${dates[0]}T12:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase() : "DATES UNAVAILABLE";
  const last = dates.at(-1) ? new Date(`${dates.at(-1)}T12:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase() : "";
  const reference = metadata?.common_reference_window;
  return coordinateOnly
    ? <span className="orbit-coordinate">{reference ? `${Math.abs(reference.lat).toFixed(4)}° ${reference.lat >= 0 ? "N" : "S"}<br/>${Math.abs(reference.lon).toFixed(4)}° ${reference.lon >= 0 ? "E" : "W"}` : "REFERENCE WINDOW"}</span>
    : <div className="hero-footnote"><i/> SENTINEL-1 · {dates.length || "…"} OBSERVATIONS · {first}{last ? ` — ${last}` : ""}</div>;
}

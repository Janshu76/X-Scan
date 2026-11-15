"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useViewMode, ViewModeSelector } from "@/regions/ViewMode";
import MexicoExperience from "@/regions/mexico_city/MexicoExperience";
import SharedEvidence from "@/regions/SharedEvidence";

type AdjustedSummary = { source: string; dates: string[]; velocity_cm_per_year: { p2: number; median: number; p98: number }; pixels_valid_in_all_blocks_percent: number; share_of_valid_pixels_percent: { sinking_faster_than_3_cm_per_year: number; sinking_faster_than_10_cm_per_year: number }; stable_ground_adjustment: { offset_subtracted_cm_per_year: number; assumption: string; independent_gnss_check: { stations_used: number } } };

const regions = {
  "mexico-city": { name: "Mexico City", eyebrow: "MEXICO · OBSERVATIONS AVAILABLE" },
  assam: { name: "Majuli–Jorhat, Assam", eyebrow: "ASSAM · DRAFT AOI · NOT APPROVED" },
  antarctica: { name: "Pine Island Glacier", eyebrow: "ANTARCTICA · DRAFT AOI · NOT APPROVED" },
} as const;

function Header() {
  return <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">T</span><span>TERRAWATCH <i>REGIONAL OBSERVATORY</i></span></Link><nav><Link href="/">Explore</Link><Link href="/regions/mexico-city#time-machine">Time Machine</Link><Link href="/data-library">Data Library</Link><Link href="/data-methods">Methods</Link></nav><ViewModeSelector/></header>;
}

export function RegionPage({ region }: { region: keyof typeof regions }) {
  const { mode } = useViewMode();
  const meta = regions[region];
  const [summary, setSummary] = useState<AdjustedSummary | null>(null);
  useEffect(() => {
    if (region !== "mexico-city") return;
    fetch("/data/regions/mexico_city/pack_summary.json").then((response) => response.ok ? response.json() as Promise<AdjustedSummary> : null).then(setSummary).catch(() => setSummary(null));
  }, [region]);

  return <main className="site-shell space-shell observatory-shell phase-region-shell">
    <Header/>
    {region === "mexico-city" ? <>
      <section className="phase-region-intro machine-page-intro"><p className="eyebrow">{meta.eyebrow}</p><h1>{meta.name}</h1></section>
      <MexicoExperience/>
      <SharedEvidence regionId="mexico_city" view={mode}/>
      {mode === "research" && <section className="research-summary-strip"><span>DATASET: {summary?.source ?? "Loading adjusted pack…"}</span><span>VALID IN ALL BLOCKS: {summary ? `${summary.pixels_valid_in_all_blocks_percent}%` : "Loading"}</span><span>GNSS: two quiet stations informed the adjustment check; three comparison stations; vertical vs LOS, approximate.</span></section>}
    </> : <><section className="phase-region-intro"><p className="eyebrow">{meta.eyebrow}</p><h1>{meta.name}</h1><p>This region is not yet supported by downloaded observations. The area and analysis plan remain provisional.</p></section><section className="planned-region-panel"><span className="evidence-unavailable">UNAVAILABLE · NO OBSERVATIONS LOADED</span><h2>Data not yet downloaded</h2><p>The area is a <b>draft, not approved</b> study selection. No satellite measurements, rates, or impact findings are shown here.</p><h3>Planned, separate analyses</h3><ul>{region === "assam" ? <><li>Flood-water extent for a selected event</li><li>Longer-term river-channel migration</li><li>Bank erosion and deposition as separate mapped changes</li></> : <><li>Glacier surface velocity</li><li>Ice-shelf extent</li><li>Ice elevation and mass-balance context, kept distinct</li></>}</ul><p className="micro-note">AOI approval and suitable data are still needed. No forecasts or damage/risk conclusions are produced.</p></section></>}
    <footer className="site-footer"><Link href="/">← All study areas</Link><span>Research preview · Evidence and limits shown together</span></footer>
  </main>;
}

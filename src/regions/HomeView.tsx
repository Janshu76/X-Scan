"use client";

import Link from "next/link";
import { ViewModeSelector, useViewMode } from "@/regions/ViewMode";
import WorldStudyMap from "@/regions/WorldStudyMap";
import SharedEvidence from "@/regions/SharedEvidence";

const regions = [
  { href: "/regions/mexico-city", name: "Mexico City", label: "OBSERVATIONS AVAILABLE", description: "Sentinel-1 measurements of relative ground motion, with processing caveats and context." },
  { href: "/regions/assam", name: "Majuli–Jorhat, Assam", label: "DRAFT AOI · NOT APPROVED", description: "Planned floodplain observation. No regional observations are loaded." },
  { href: "/regions/antarctica", name: "Pine Island Glacier", label: "DRAFT AOI · NOT APPROVED", description: "Planned ice-motion context. No regional observations are loaded." },
];

function SiteHeader() {
  return <header className="topbar"><Link className="brand" href="/" aria-label="TerraWatch home"><span className="brand-mark">T</span><span>TERRAWATCH <i>EARTH OBSERVATION</i></span></Link><nav><Link className="active" href="/">Explore</Link><Link href="/regions/mexico-city#time-machine">Time Machine</Link><Link href="/data-library">Data Library</Link><Link href="/data-methods">Methods</Link></nav><ViewModeSelector/></header>;
}

export default function HomeView() {
  const { mode } = useViewMode();
  return <main className="site-shell space-shell observatory-shell phase-home">
    <SiteHeader/>
    {mode === "public" ? <>
      <section className="phase-home-hero"><div><p className="eyebrow">EARTH OBSERVATION · FIELD NOTES</p><h1>See how our<br/><em>planet changes.</em></h1><p className="dek">TerraWatch brings satellite observations and their limits into one place, so you can explore what has been measured and what remains unknown.</p><a className="phase-primary-link" href="#explore">Explore the planet ↓</a><Link className="phase-secondary-link" href="/regions/mexico-city#time-machine">Open the Time Machine ↗</Link></div><WorldStudyMap/></section>
      <section id="explore" className="phase-section"><div className="phase-section-heading"><span>01 · EXPLORE THE PLANET</span><h2>Start with a place</h2><p>Only Mexico City currently has an observation record. The other markers and areas are explicitly draft planning locations.</p></div><div className="region-card-grid">{regions.map((region) => <article className="region-card" key={region.href}><span>{region.label}</span><h3>{region.name}</h3><p>{region.description}</p><Link href={region.href}>Open region ↗</Link></article>)}</div></section>
      <section className="phase-section"><div className="phase-section-heading"><span>02 · DISCOVER CHANGING PLACES</span><h2>Featured observations</h2></div><div className="phase-story-grid"><article className="phase-story-card"><span className="evidence-public">OBSERVED</span><h3>Mexico City · Ground motion from radar</h3><p>Explore the supplied Sentinel-1 line-of-sight record, with its stable-ground assumption and uncertainty shown alongside.</p><Link href="/regions/mexico-city">Explore observation ↗</Link></article><article className="phase-story-card coming"><span className="evidence-unavailable">COMING · NO DATA</span><h3>Majuli–Jorhat · A living river</h3><p>Flood inundation, river migration, erosion and deposition will be treated as separate questions when data are available.</p><Link href="/regions/assam">See data status ↗</Link></article><article className="phase-story-card coming"><span className="evidence-unavailable">COMING · NO DATA</span><h3>Pine Island Glacier · Ice in motion</h3><p>Ice velocity, shelf extent, elevation and mass balance are distinct measurements. No Antarctic observations are loaded.</p><Link href="/regions/antarctica">See data status ↗</Link></article></div><SharedEvidence regionId="mexico_city" view="public" compact/></section>
      <section className="phase-pillars"><article><span>03 · WATCH EARTH&apos;S STORY</span><h2>Follow measured change through time</h2><p>Time controls, compare views and context layers stay tied to the files that are actually available.</p></article><article><span>04 · WHY THESE CHANGES MATTER</span><h2>Separate evidence from explanation</h2><p>Observed measurements, contextual information, possible explanations and unavailable data are labelled separately.</p></article></section>
      <section className="phase-about"><span>WHAT TERRAWATCH DOES</span><p>TerraWatch organizes Earth-observation datasets and explains what they can—and cannot—support. It does not turn an observed signal into a claim about cause, damage or future outcomes.</p><Link href="/data-methods">Read data and methods ↗</Link></section>
    </> : <>
      <section className="research-home-head"><p className="eyebrow">RESEARCH WORKSPACE</p><h1>Study areas &amp; data status</h1><p>Research View exposes the same observations with provenance, processing notes and limitations.</p></section>
      <section className="phase-section"><div className="phase-section-heading"><span>REGION SELECTOR</span><h2>Available and planned studies</h2></div><div className="region-card-grid">{regions.map((region) => <article className="region-card" key={region.href}><span>{region.label}</span><h3>{region.name}</h3><p>{region.description}</p><Link href={region.href}>Open workspace ↗</Link></article>)}</div></section>
      <section className="research-shortcuts"><Link href="/regions/mexico-city#time-machine">Mexico City Time Machine <span>Velocity overlay, dates and compare ↗</span></Link><Link href="/data-library">Data Library <span>Catalog, manifest and file status ↗</span></Link><Link href="/acquisition">Data Acquisition <span>Search and review selected products ↗</span></Link><Link href="/data-methods">Methods &amp; provenance <span>Sources, limitations and processing ↗</span></Link></section><WorldStudyMap/><SharedEvidence regionId="mexico_city" view="research" compact/>
    </>}
    <footer className="site-footer"><span>TerraWatch · Evidence-led Earth observation</span><span>Simulated content is labelled; missing measurements remain unavailable.</span></footer>
  </main>;
}

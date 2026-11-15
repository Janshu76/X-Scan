"use client";

import { useEffect, useState } from "react";
import { useViewMode } from "@/regions/ViewMode";
import type { MexicoSeries } from "@/regions/model";
import EarthTimeMachine, { mexicoCityDataset } from "@/regions/mexico_city/EarthTimeMachine";
import ContextEvidencePanel from "@/regions/mexico_city/ContextEvidencePanel";
import ConfidencePanel from "@/regions/mexico_city/ConfidencePanel";
import IntervalAnalysis from "@/regions/mexico_city/IntervalAnalysis";
import PublishedContextPanel from "@/regions/mexico_city/PublishedContextPanel";
import ReportActions from "@/regions/mexico_city/ReportActions";
import StoryMode, { ScenarioPanel } from "@/regions/mexico_city/StoryMode";
import { signed } from "@/regions/mexico_city/analysis";
import catalogJson from "../../../data/catalog/datasets.json";

const catalog = catalogJson.datasets;

export default function MexicoExperience() {
  const { mode } = useViewMode();
  const [series, setSeries] = useState<MexicoSeries | null>(null);

  useEffect(() => {
    fetch(mexicoCityDataset.seriesUrl).then((response) => response.ok ? response.json() as Promise<MexicoSeries> : null).then(setSeries).catch(() => setSeries(null));
  }, []);

  return <div className="mexico-experience">
    <EarthTimeMachine dataset={mexicoCityDataset} view={mode}/>
    {series && <section className="machine-summary-cards">
      <article className="card"><span className="section-kicker">MEASURED · ADJUSTED PACK</span><b>{signed(series.mean_rate_cm_per_year_fastest_1pct)} cm/year{mode === "research" ? " LOS" : ""}</b><p>{mode === "public" ? "Average rate in the most-moving 1% of the sample, measured along the satellite's view." : "Mean rate across the most-subsiding 1% of approximate sample points. It is relative line-of-sight motion, not vertical movement."}</p></article>
      <article className="card"><span className="section-kicker">{mode === "public" ? "DATA COVERAGE" : "CONTEXT · APPROXIMATE"}</span><b>{(series.valid_pixel_fraction * 100).toFixed(1)}%{mode === "public" ? " of data available" : " valid"}</b><p>{mode === "public" ? "Share of the sample with measurements through every date." : "Share of the sampled scene valid across all processing blocks. The stable-ground reference is an assumption, not proven ground stability."}</p></article>
      <article className="card"><span className="section-kicker">UNAVAILABLE</span><b>Roads and facilities: NOT ADDED</b><p>No lengths, exposure counts, damage findings, or risk estimates are calculated.</p></article>
    </section>}
    {mode === "research" && <details className="public-research-details machine-extra-details">
      <summary>Extra research detail: metadata, context, and processing history</summary>
      <ContextEvidencePanel/>
      {series && <>
        <IntervalAnalysis series={series} selectedDateIndex={0} onSelectInterval={() => undefined}/>
        <StoryMode series={series} onScene={() => undefined} onDate={() => undefined} onFocusStrongest={() => undefined}/>
        <ScenarioPanel series={series}/>
        <ConfidencePanel series={series} catalog={catalog}/>
        <ReportActions series={series} catalog={catalog}/>
      </>}
      <PublishedContextPanel/>
    </details>}
    {mode === "public" && <ContextEvidencePanel/>}
  </div>;
}

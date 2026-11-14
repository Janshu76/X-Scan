"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import catalogJson from "../../../data/catalog/datasets.json";
import { buildConfidence, buildIntervals, elapsedYears, limitations, recommendedInvestigations, signed, wholeSceneMedianRate } from "@/regions/mexico_city/analysis";
import { publishedContext, publishedContextClosing } from "@/regions/mexico_city/publishedContext";
import type { MexicoSeries } from "@/regions/model";
import { formatDate } from "@/regions/model";

const catalog = catalogJson.datasets;

export default function InvestigationReport() {
  const [series, setSeries] = useState<MexicoSeries | null>(null);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState("");
  useEffect(() => {
    setGenerated(new Date().toLocaleString());
    fetch("/data/regions/mexico_city/series.json").then((response) => {
      if (!response.ok) throw new Error("Series metadata could not be loaded for the report.");
      return response.json() as Promise<MexicoSeries>;
    }).then(setSeries).catch((reason: Error) => setError(reason.message));
  }, []);
  if (error) return <main className="print-report"><p role="alert">{error}</p><Link href="/">Return to TerraWatch</Link></main>;
  if (!series) return <main className="print-report"><p>Loading report data…</p></main>;
  const intervals = buildIntervals(series);
  const confidence = buildConfidence(series, catalog);
  const next = recommendedInvestigations(catalog);
  const medianRate = wholeSceneMedianRate(series);
  const total = series.series_fastest_1pct_cm.at(-1) ?? 0;
  const years = elapsedYears(series.dates[0], series.dates.at(-1)!);
  return <main className="print-report">
    <div className="report-toolbar"><Link href="/">← TerraWatch</Link><button className="play-button" onClick={() => window.print()}>Print / Save as PDF</button></div>
    <header><p className="eyebrow">TERRAWATCH · INVESTIGATION REPORT</p><h1>{series.area}: observed line-of-sight displacement</h1><p>Generated {generated}</p></header>
    <section><h2>Data sources</h2><div className="print-table-wrap"><table><thead><tr><th>Dataset</th><th>Source</th><th>Dates</th><th>Resolution</th><th>Licence</th></tr></thead><tbody>{catalog.map((entry) => <tr key={entry.id}><td>{entry.name}</td><td>{entry.provider ?? "Not recorded"}</td><td>{Array.isArray(entry.dates) ? `${formatDate(entry.dates[0])}–${formatDate(entry.dates.at(-1)!)}` : entry.dates ?? "Not applicable / not recorded"}</td><td>{entry.spatial_resolution ?? "Not recorded"}</td><td>{entry.license ?? "Not recorded"}</td></tr>)}</tbody></table></div></section>
    <section><h2>Observed values</h2><ul>
      <li>Product: {series.product}.</li>
      <li>Observation period: {formatDate(series.dates[0])} to {formatDate(series.dates.at(-1)!)} ({years.toFixed(2)} years).</li>
      <li>Fastest-zone mean cumulative change: {signed(total)} cm LOS.</li>
      <li>Fastest-one-percent annualised mean rate: {signed(series.mean_rate_cm_per_year_fastest_1pct)} cm/year LOS; relative to a reference point, not an exact absolute rate.</li>
      <li>Whole-scene median annualised endpoint rate: {medianRate === null ? "not available" : `${signed(medianRate)} cm/year LOS`}. A positive median is not interpreted as the city rising.</li>
      <li>Valid pixel fraction: {(series.valid_pixel_fraction * 100).toFixed(1)}%.</li>
    </ul><p>{series.caveat} LOS is not vertical movement.</p></section>
    <section><h2>Interval changes</h2><div className="print-table-wrap"><table><thead><tr><th>Interval</th><th>Fastest-zone change (cm)</th><th>Fastest-zone rate (cm/yr)</th><th>Scene median change (cm)</th><th>Scene median rate (cm/yr)</th></tr></thead><tbody>{intervals.map((item) => <tr key={`${item.from}-${item.to}`}><td>{item.label}</td><td>{signed(item.fastestChangeCm)}</td><td>{signed(item.fastestRateCmPerYear)}</td><td>{signed(item.medianChangeCm)}</td><td>{signed(item.medianRateCmPerYear)}</td></tr>)}</tbody></table></div><p>Seasonal effects such as rainy and dry periods may influence individual intervals; this has not been tested here.</p></section>
    <section><h2>Confidence indicators</h2><ul>{confidence.map((item) => <li key={item.title}><b>{item.title}: {item.level}.</b> {item.reason}</li>)}</ul></section>
    <section><h2>Data limitations</h2><ul>{limitations(series).map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section><h2>Possible explanations (hypotheses, not tested)</h2><p>Mexico City overlies compressible lake-bed clays. Published literature discusses groundwater extraction, urban loading, and local geology as possible contributors. This project has no groundwater levels, pumping records, or geotechnical maps, so it cannot test those explanations. Atmospheric delay, reference-point effects, unwrapping errors, processing artefacts, and seasonal effects may also influence the signal.</p></section>
    <section><h2>Recommended further investigation</h2><ul>{next.map((item) => <li key={item.title}><b>{item.title} — {item.availability}.</b> {item.reason}</li>)}</ul></section>
    <section><h2>Published context (literature, not project data)</h2><ol>{publishedContext.map((entry) => <li key={entry.id}><b>{entry.period}: {entry.title}.</b> {entry.detail} <a href={entry.href}>{entry.href}</a></li>)}</ol><p>{publishedContextClosing}</p></section>
    <footer>Prepared locally by TerraWatch. No external language model was called.</footer>
  </main>;
}

"use client";

import { buildConfidence, limitations, recommendedInvestigations } from "@/regions/mexico_city/analysis";
import type { CatalogEntry } from "@/regions/mexico_city/analysis";
import type { MexicoSeries } from "@/regions/model";

export default function ConfidencePanel({ series, catalog }: { series: MexicoSeries; catalog: CatalogEntry[] }) {
  const confidence = buildConfidence(series, catalog);
  const next = recommendedInvestigations(catalog);
  return <section className="analysis-detail-grid">
    <article className="card confidence-card">
      <div className="card-top"><span className="section-kicker">CONFIDENCE INDICATORS</span><span className="status-tag muted">RULE-BASED</span></div>
      <div className="confidence-list">{confidence.map((item) => <div className="confidence-item" key={item.title}>
        <div><b>{item.title}</b><span className={`confidence-chip ${item.level.toLowerCase().replaceAll(" ", "-")}`}>{item.level}</span></div>
        <p>{item.reason}</p>
      </div>)}</div>
    </article>
    <article className="card limitations-card">
      <div className="card-top"><span className="section-kicker">DATA LIMITATIONS</span><span className="status-tag muted">READ BEFORE INTERPRETING</span></div>
      <ul>{limitations(series).map((item) => <li key={item}>{item}</li>)}</ul>
    </article>
    <article className="card investigation-next-card">
      <div className="card-top"><span className="section-kicker">RECOMMENDED FURTHER INVESTIGATION</span></div>
      <ul>{next.map((item) => <li key={item.title}><span className={`availability-chip ${item.availability === "available in this app" ? "available" : "missing"}`}>{item.availability}</span><b>{item.title}</b><small>{item.reason}</small></li>)}</ul>
    </article>
  </section>;
}

"use client";

import { useEffect, useState } from "react";
import type { MexicoSeries } from "@/regions/model";
import { formatDate } from "@/regions/model";
import { buildIntervals, recommendedInvestigations, signed, wholeSceneMedianRate, type CatalogEntry } from "@/regions/mexico_city/analysis";

export type PickedLocation = { lat: number; lon: number; values?: (number | null)[] | null };
type SavedLocation = { id: string; name: string; lat: number; lon: number; date: string; note: string; values?: (number | null)[] | null; gridAvailable?: boolean };
const watchKey = "terrawatch-mexico-watchlist-v1";

export function Watchlist({ point, date, series, gridAvailable, onFlyTo }: { point: PickedLocation | null; date: string; series: MexicoSeries; gridAvailable: boolean; onFlyTo: (lat: number, lon: number) => void }) {
  const [items, setItems] = useState<SavedLocation[]>([]);
  const [name, setName] = useState(""); const [note, setNote] = useState("");
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(watchKey) ?? "[]"); if (Array.isArray(saved)) setItems(saved); } catch { setItems([]); } }, []);
  function persist(next: SavedLocation[]) { setItems(next); localStorage.setItem(watchKey, JSON.stringify(next)); }
  return <section className="card watch-card"><div className="card-top"><span className="section-kicker">PERSONAL WATCHLIST</span><span className="status-tag muted">THIS DEVICE ONLY</span></div><h3>Keep locations to revisit</h3><p>Click either map to select a location, then save it with a label and optional note. Coordinates and available sampled LOS values are kept in this browser.</p>
    <div className="watch-form"><label>Location name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. observation point"/></label><label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional context"/></label><button className="play-button" disabled={!point} onClick={() => { if (!point) return; const item = { id: `${Date.now()}`, name: name.trim() || `Location ${items.length + 1}`, lat: point.lat, lon: point.lon, date, note: note.trim(), values: point.values, gridAvailable }; persist([item, ...items]); setName(""); setNote(""); }}>Save selected point</button></div>
    {!point && <p className="micro-note">Select a point on the map first.</p>}
    <ul className="watch-list">{items.map((item) => <li key={item.id}><div><b>{item.name}</b><span>{item.lat.toFixed(4)}°, {item.lon.toFixed(4)}° · saved {formatDate(item.date)}</span>{item.note && <small>{item.note}</small>}<small>{item.values ? item.values.map((value,index) => `${formatDate(series.dates[index])}: ${value === null ? "no reliable sample" : `${signed(value)} cm LOS`}`).join(" · ") : item.gridAvailable ? "No reliable LOS sample was available at this location in the approximate inspection grid." : "LOS series unavailable: no approximate inspection grid was present when this location was saved."}</small>{item.values && <small>Nearest sample from the approximate decimated grid; not a surveyed point measurement.</small>}</div><div><button className="text-action" onClick={() => onFlyTo(item.lat, item.lon)}>Show on map</button><button className="text-action" onClick={() => persist(items.filter((part) => part.id !== item.id))}>Remove</button></div></li>)}</ul>{items.length === 0 && <div className="empty-inline">No saved locations yet.</div>}
    </section>;
}

const questions = ["What has changed?", "What do the observations reveal?", "Why might this be happening?", "What could the consequences be?", "Which datasets should be investigated next?"];
export function AskData({ series, catalog }: { series: MexicoSeries; catalog: CatalogEntry[] }) {
  const [question, setQuestion] = useState(questions[0]); const intervals = buildIntervals(series);
  const fastest = series.series_fastest_1pct_cm.at(-1) ?? 0;
  const evidence = { start: series.dates[0], end: series.dates.at(-1)!, fastestMeanFinalCm: fastest, wholeSceneMedianRate: wholeSceneMedianRate(series), product: series.product, intervalRates: intervals.map((item) => ({ label: item.label, rate: item.fastestRateCmPerYear })) };
  // Deterministic template interface accepts structured evidence, so a future model adapter can replace it without changing evidence collection.
  const answerTemplate = (q: string, data: typeof evidence) => q === questions[0]
    ? `Across ${formatDate(data.start)}–${formatDate(data.end)}, the mean cumulative line-of-sight change in the most-subsiding 1% of valid pixels is ${signed(data.fastestMeanFinalCm)} cm. The whole-scene median endpoint rate is ${data.wholeSceneMedianRate === null ? "unavailable" : `${signed(data.wholeSceneMedianRate)} cm/year`}. This does not represent every location or establish vertical motion.`
    : q === questions[1]
      ? (() => { const ranked = [...data.intervalRates].sort((a,b) => Math.abs(b.rate)-Math.abs(a.rate)).slice(0,3); return `The largest absolute annualized changes in the fastest-one-percent series are ${ranked.map((item) => `${item.label}: ${signed(item.rate)} cm/year`).join("; ")}. Irregular time gaps are annualized by elapsed days. Seasonal effects and processing uncertainty are not tested.`; })()
      : q === questions[2]
        ? "Published research discusses groundwater extraction, urban loading, and local geology as possible contributors to Mexico City subsidence. They are hypotheses only: this app has no groundwater levels, pumping records, or geotechnical maps to test them. Atmospheric delay and reference effects may also contribute."
        : q === questions[3]
          ? "Exposure counts are unavailable until verified roads, facilities, and building layers are added. Displacement does not establish damage or risk, and this app does not infer consequences."
          : `Further investigations: ${recommendedInvestigations(catalog).map((item) => `${item.title} (${item.availability})`).join("; ")}.`;
  const answer = answerTemplate(question, evidence);
  return <section className="card ask-card"><div className="card-top"><span className="section-kicker">ASK DATA · LOCAL TEMPLATES</span><span className="status-tag">NO AI CALLS</span></div><h3>Explore the evidence</h3><label>Choose a question<select value={question} onChange={(event) => setQuestion(event.target.value)}>{questions.map((item) => <option key={item}>{item}</option>)}</select></label><div className="answer-block"><b>Template answers from measured data; no language model is used yet</b><p>{answer}</p><div className="answer-meta"><span>Observation period: {formatDate(series.dates[0])}–{formatDate(series.dates.at(-1)!)}</span><span>Source: {series.product}</span><span>Known limitation: relative line-of-sight displacement; not vertical motion.</span></div></div>
  </section>;
}

export function RegionCards() {
  return <section className="region-cards" aria-label="TerraWatch regions"><div className="card-top"><span className="section-kicker">REGIONS</span><span className="status-tag muted">MEXICO MVP</span></div><div className="region-card-grid"><article className="region-card active-region"><span>ACTIVE · MEXICO</span><h3>Mexico City</h3><p>Sentinel-1 OPERA displacement record with interval analysis and transparent limitations.</p></article><article className="region-card planned-region"><span>DATA COLLECTION IN PROGRESS</span><h3>The Living River</h3><p>Brahmaputra, Assam · planned river and floodplain observations. No preview data is included in this Mexico-only MVP.</p></article><article className="region-card planned-region"><span>DATA COLLECTION IN PROGRESS</span><h3>A Changing Antarctica: The Story Written in Ice</h3><p>Pine Island Glacier · planned ice and surface-motion observations. No Antarctica preview data is included in this Mexico-only MVP.</p></article></div></section>;
}

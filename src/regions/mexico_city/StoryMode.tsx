"use client";

import { useEffect, useMemo, useState } from "react";
import type { MexicoSeries } from "@/regions/model";
import { formatDate } from "@/regions/model";
import { buildIntervals, signed } from "@/regions/mexico_city/analysis";

type Scene = { id: string; type: "map" | "chart" | "text"; title: string; narration: string; dateIndex: number; mapState: { date: string; compareDate: string; layers: string[] }; chart?: string; caveat?: string; branch?: boolean };
type Props = { series: MexicoSeries; onScene: (dateIndex: number, compareIndex: number, layers: string[]) => void; onDate: (index: number) => void; onFocusStrongest: () => void };
const storageKey = "terrawatch-mexico-story-v1";

function initialScenes(series: MexicoSeries): Scene[] {
  return [
    { id: "past", type: "map", title: "The Past · establish the baseline", narration: "This is the first available acquisition. The baseline is zero by definition; it is not a measurement of absolute ground height.", dateIndex: 0, mapState: { date: series.dates[0], compareDate: series.dates.at(-1)!, layers: ["aoi"] }, caveat: "Baseline zero is a relative reference, not absolute height." },
    { id: "transformation", type: "chart", title: "The Transformation · follow the observations", narration: `The series contains ${series.dates.length} available acquisitions from ${formatDate(series.dates[0])} to ${formatDate(series.dates.at(-1)!)}. The fastest-subsiding one percent is a selected pixel group, not the whole city.`, dateIndex: series.dates.length - 1, mapState: { date: series.dates.at(-1)!, compareDate: series.dates[0], layers: ["displacement", "aoi"] }, chart: "intervals", caveat: series.caveat },
    { id: "present", type: "map", title: "The Present · latest available observation", narration: `The latest supplied observation is ${formatDate(series.dates.at(-1)!)}. The fastest-subsiding one-percent mean rate is ${signed(series.mean_rate_cm_per_year_fastest_1pct)} cm/year LOS, relative to a reference point. This is not an exact absolute rate.`, dateIndex: series.dates.length - 1, mapState: { date: series.dates.at(-1)!, compareDate: series.dates[0], layers: ["displacement", "aoi"] }, caveat: `${series.caveat} LOS is not vertical motion.` },
    { id: "unknowns", type: "text", title: "Why It Matters · what remains unknown", narration: "Atmospheric delay, reference-point effects, unwrapping errors, and seasonal effects may influence the pattern. Groundwater and pumping records, geotechnical maps, GNSS, and verified roads, facilities, terrain, and buildings are not loaded, so causes and exposure cannot be tested.", dateIndex: series.dates.length - 1, mapState: { date: series.dates.at(-1)!, compareDate: series.dates[0], layers: ["aoi"] }, caveat: series.caveat },
    { id: "future", type: "text", title: "The Future · scenario, not observation", narration: "The What-if Explorer extends an observed line-of-sight rate using explicit assumptions. This is a scenario, not a forecast or prediction, and it says nothing about future damage or consequences.", dateIndex: series.dates.length - 1, mapState: { date: series.dates.at(-1)!, compareDate: series.dates[0], layers: ["aoi"] }, caveat: "Scenario, not observation." },
  ];
}

export default function StoryMode({ series, onScene, onDate, onFocusStrongest }: Props) {
  const [scenes, setScenes] = useState<Scene[]>(() => initialScenes(series));
  const [sceneIndex, setSceneIndex] = useState(0);
  const [narrationStyle, setNarrationStyle] = useState("Plain language");
  const [duration, setDuration] = useState("Standard · 5 scenes");
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [language, setLanguage] = useState("en-US");
  const [editing, setEditing] = useState(false);
  const activeScenes = duration.startsWith("Short") ? scenes.slice(0, 3) : scenes;
  const scene = activeScenes[Math.min(sceneIndex, activeScenes.length - 1)];
  const progress = activeScenes.length > 1 ? (sceneIndex / (activeScenes.length - 1)) * 100 : 0;
  useEffect(() => { setSpeechSupported("speechSynthesis" in window && "SpeechSynthesisUtterance" in window); }, []);
  const narration = useMemo(() => {
    if (narrationStyle === "Scientific") return `${scene.narration} Product: ${series.product}. Units: ${series.units}. The line-of-sight measurement is relative to a reference point.`;
    if (narrationStyle === "Brief") return `${scene.title}. ${scene.narration.split(".")[0]}.`;
    return scene.narration;
  }, [narrationStyle, scene, series]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Scene[];
        if (Array.isArray(parsed) && parsed.length && parsed.every((item) => ["map", "chart", "text"].includes(item.type) && item.mapState)) setScenes(parsed.map((item) => ({ ...item, dateIndex: Math.max(0, Math.min(series.dates.length - 1, item.dateIndex)) })));
      }
    } catch { /* An unreadable local draft is ignored. */ }
  }, [series.dates.length]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setSceneIndex((index) => {
      if (index >= activeScenes.length - 1) { setPlaying(false); return index; }
      return index + 1;
    }), Math.max(scene.id === "transformation" ? series.dates.length * 520 : 3000, narration.split(/\s+/).length * 330));
    return () => window.clearInterval(timer);
  }, [playing, duration, activeScenes.length, narration, scene.id, series.dates.length]);

  useEffect(() => {
    if (!scene) return;
    if (scene.id === "transformation") onScene(0, series.dates.length - 1, scene.mapState.layers);
    else {
      const compare = Math.max(0, series.dates.indexOf(scene.mapState.compareDate));
      onScene(scene.dateIndex, compare, scene.mapState.layers);
    }
    if (scene.id.startsWith("branch-strongest")) onFocusStrongest();
  }, [sceneIndex, scene, onScene, onFocusStrongest, series.dates]);

  useEffect(() => {
    if (!playing || scene.id !== "transformation" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cursor = 0;
    const timer = window.setInterval(() => { cursor += 1; onDate(cursor); if (cursor >= series.dates.length - 1) window.clearInterval(timer); }, 500);
    return () => window.clearInterval(timer);
  }, [playing, scene.id, series.dates.length, onDate]);

  useEffect(() => { if (sceneIndex >= activeScenes.length) setSceneIndex(Math.max(0, activeScenes.length - 1)); }, [duration, scenes.length, sceneIndex, activeScenes.length]);
  useEffect(() => {
    if (!voice || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(narration); utterance.lang = language; speechSynthesis.speak(utterance);
    return () => speechSynthesis.cancel();
  }, [voice, language, narration]);

  function moveScene(delta: number) { setSceneIndex((index) => Math.max(0, Math.min(activeScenes.length - 1, index + delta))); }
  function saveDraft() { localStorage.setItem(storageKey, JSON.stringify(scenes)); }
  function addBranch(title: string) {
    const insertAt = Math.max(0, scenes.findIndex((item) => item.id === "unknowns"));
    const branches: Scene[] = [
      { id: `branch-${title.toLowerCase().includes("strongest") ? "strongest" : "choice"}-${Date.now()}`, type: "chart", title, narration: title.toLowerCase().includes("strongest") ? "The selected rate group describes the most-subsiding one percent of valid pixels; it is not representative of every location." : title.toLowerCase().includes("time") ? "The interval chart shows rates computed from each pair of real acquisition dates. The intervals are irregular and seasonal effects are not tested." : "The missing-data list shows which causes and exposures remain untested in this project.", dateIndex: series.dates.length - 1, mapState: { date: series.dates.at(-1)!, compareDate: series.dates[0], layers: ["displacement", "aoi"] }, chart: title.toLowerCase().includes("time") ? "intervals" : undefined, caveat: series.caveat, branch: true },
    ];
    const next = [...scenes.slice(0, insertAt), ...branches, ...scenes.slice(insertAt)]; setScenes(next); setSceneIndex(insertAt);
  }

  return <section className="card story-card" aria-labelledby="story-title">
    <div className="card-top"><span className="section-kicker">EARTH TIME MACHINE · GUIDED STORY</span><span className="status-tag">OBSERVATIONS ONLY</span></div>
    <h3 id="story-title">A guided look through the Mexico City record</h3>
    <div className="story-progress"><div style={{ width: `${progress}%` }}/></div>
    <div className="story-controls"><button className="quiet-button" onClick={() => moveScene(-1)} disabled={sceneIndex === 0}>← Previous</button><span>Scene {sceneIndex + 1} of {activeScenes.length}</span><button className="play-button" onClick={() => setPlaying((value) => !value)}>{playing ? "Ⅱ Pause story" : "▶ Play story"}</button><button className="quiet-button" onClick={() => moveScene(1)} disabled={sceneIndex === activeScenes.length - 1}>Next →</button></div>
    <div className="story-content"><div><span className="section-kicker">{scene.type.toUpperCase()} · {formatDate(series.dates[scene.dateIndex])}</span><h4>{scene.title}</h4><p aria-live="polite">{narration}</p><p className="micro-note">{scene.caveat ?? series.caveat} LOS is not vertical displacement.</p>{scene.chart === "intervals" && <div className="story-interval-preview" aria-label="Observed interval rates">{buildIntervals(series).map((item) => <div key={item.from} title={`${item.label}: ${signed(item.fastestRateCmPerYear)} cm per year`}><span style={{ height: `${Math.max(4,Math.min(45,Math.abs(item.fastestRateCmPerYear)))}px` }}/><small>{item.label.slice(0,6)}</small></div>)}</div>}{(scene.id === "unknowns" || scene.id.startsWith("branch-choice")) && <ul className="story-missing-list"><li>Groundwater levels and pumping records: unavailable, so extraction hypotheses cannot be tested.</li><li>Geotechnical and lake-zone maps: unavailable, so soil-unit explanations cannot be compared.</li><li>GNSS, roads, facilities and building layers: unavailable for independent comparison or exposure counts.</li><li>Atmospheric, reference-point and seasonal effects remain possible influences.</li></ul>}</div>
      <div className="story-options"><label>Narration<select value={narrationStyle} onChange={(event) => setNarrationStyle(event.target.value)}><option>Plain language</option><option>Scientific</option><option>Brief</option></select></label><label>Story duration<select value={duration} onChange={(event) => { setDuration(event.target.value); setSceneIndex(0); }}><option>Short · 3 scenes</option><option>Standard · 5 scenes</option><option>Long · 5 scenes plus branches</option></select></label><label className="toggle-row"><input type="checkbox" checked={voice} disabled={!speechSupported} onChange={(event) => setVoice(event.target.checked)}/> Spoken narration (off by default)</label>{voice && <label>Voice language<select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en-US">English</option><option value="es-MX">Español (México)</option></select></label>}{!speechSupported && <span className="micro-note">Speech synthesis is unavailable in this browser.</span>}</div></div>
    {scene.id === "present" && duration.startsWith("Long") && <div className="branch-choices"><b>Choose a path after Present</b><button onClick={() => addBranch("Explore where it is strongest")}>Explore where it is strongest</button><button onClick={() => addBranch("Explore how it changed over time")}>Explore how it changed over time</button><button onClick={() => addBranch("What we still don&apos;t know")}>What we still don&apos;t know</button></div>}
    <div className="story-editor"><div className="card-top"><b>Storyboard editor</b><button className="text-action" onClick={() => setEditing((value) => !value)}>{editing ? "Close editor" : "Edit scenes"}</button></div><ol className="storyboard-cards">{activeScenes.map((item,index) => <li key={item.id}><button onClick={() => setSceneIndex(index)}><small>{item.type.toUpperCase()}</small><b>{item.title}</b><span>{item.narration.slice(0,110)}{item.narration.length>110?"…":""}</span></button></li>)}</ol>{editing && <><ol className="scene-list">{scenes.map((item, index) => <li key={item.id}><span>{item.title}</span><button aria-label={`Move ${item.title} up`} disabled={!index} onClick={() => { const copy = [...scenes]; [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]]; setScenes(copy); }}>↑</button><button aria-label={`Move ${item.title} down`} disabled={index === scenes.length - 1} onClick={() => { const copy = [...scenes]; [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]]; setScenes(copy); }}>↓</button><button aria-label={`Edit narration for ${item.title}`} onClick={() => { const text = window.prompt("Edit this scene narration", item.narration); if (text !== null) setScenes((current) => current.map((part) => part.id === item.id ? { ...part, narration: text } : part)); }}>Edit narration</button><button aria-label={`Duplicate ${item.title}`} onClick={() => { const copy = { ...item, id: `copy-${Date.now()}`, title: `${item.title} (copy)` }; setScenes((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)]); }}>Duplicate</button><button onClick={() => { if (scenes.length > 1) setScenes((current) => current.filter((part) => part.id !== item.id)); }}>Remove</button></li>)}</ol><div className="add-scene"><label>Add renderable scene type<select id="add-scene-type"><option value="map">Map</option><option value="chart">Interval chart</option><option value="text">Text / caveat</option></select></label><button className="quiet-button" onClick={() => { const type = (document.getElementById("add-scene-type") as HTMLSelectElement).value as Scene["type"]; const fresh: Scene = { id: `custom-${Date.now()}`, type, title: "New scene", narration: "Add a narration for this scene.", dateIndex: series.dates.length - 1, mapState: { date: series.dates.at(-1)!, compareDate: series.dates[0], layers: ["aoi"] }, caveat: series.caveat }; setScenes((current) => [...current, fresh]); }}>Add scene</button></div><div className="story-actions"><button className="quiet-button" onClick={saveDraft}>Save storyboard to this device</button><button className="quiet-button" onClick={() => { localStorage.removeItem(storageKey); setScenes(initialScenes(series)); setSceneIndex(0); }}>Reset to default</button><span>Scene order and text stay in this browser only.</span></div></>}</div>
  </section>;
}

export function ScenarioPanel({ series }: { series: MexicoSeries }) {
  const intervals = buildIntervals(series);
  const [horizon, setHorizon] = useState(5);
  const [rateChoice, setRateChoice] = useState("All-period mean");
  const [multiplier, setMultiplier] = useState(100);
  const observedRate = series.mean_rate_cm_per_year_fastest_1pct;
  const selected = rateChoice === "Last two intervals" ? intervals.slice(-2).reduce((a, b) => a + b.fastestRateCmPerYear, 0) / Math.max(1, intervals.slice(-2).length) : rateChoice === "Strongest interval" ? intervals.reduce((a, b) => Math.abs(a.fastestRateCmPerYear) > Math.abs(b.fastestRateCmPerYear) ? a : b, intervals[0])?.fastestRateCmPerYear ?? observedRate : observedRate;
  const scenarioRate = selected * multiplier / 100;
  const finalObserved = series.series_fastest_1pct_cm.at(-1) ?? 0;
  const scenario = finalObserved + scenarioRate * horizon;
  const intervalRates = intervals.map((item) => item.fastestRateCmPerYear * multiplier / 100);
  const rangeRates = intervalRates.length ? intervalRates : [scenarioRate];
  const rangeA = finalObserved + Math.min(...rangeRates) * horizon;
  const rangeB = finalObserved + Math.max(...rangeRates) * horizon;
  const lower = Math.min(rangeA, rangeB); const upper = Math.max(rangeA, rangeB);
  const observedValues = series.series_fastest_1pct_cm;
  const allValues = [...observedValues, lower, upper, finalObserved, scenario];
  const valueMin = Math.min(...allValues); const valueMax = Math.max(...allValues); const valueSpan = valueMax - valueMin || 1;
  const y = (value: number) => 120 - ((value - valueMin) / valueSpan) * 100;
  const observedPoints = observedValues.map((value,index)=>`${index/Math.max(1,observedValues.length-1)*470},${y(value)}`).join(" ");
  return <section className="card scenario-card"><div className="card-top"><span className="section-kicker">WHAT-IF EXPLORER</span><span className="status-tag muted">SCENARIO, NOT OBSERVATION</span></div><h3>Extend an observed rate as a simple scenario</h3><p>Adjust assumptions to see a transparent arithmetic continuation. This is not a forecast, prediction, risk estimate, or expected outcome.</p>
    <div className="scenario-controls"><label>Horizon: {horizon} years<input type="range" min="1" max="10" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}/></label><label>Rate source<select value={rateChoice} onChange={(event) => setRateChoice(event.target.value)}><option>All-period mean</option><option>Last two intervals</option><option>Strongest interval</option></select></label><label>Rate multiplier: {multiplier}%<input type="range" min="50" max="150" step="5" value={multiplier} onChange={(event) => setMultiplier(Number(event.target.value))}/></label></div>
    <div className="scenario-result"><span>Observed endpoint</span><b>{signed(finalObserved)} cm LOS</b><span>Scenario endpoint after {horizon} years</span><b>{signed(scenario)} cm LOS</b><span>Illustrative range from interval variability</span><b>{signed(lower)} to {signed(upper)} cm LOS</b></div>
    <div className="scenario-chart" role="img" aria-label="Observed series as a solid line and a dashed scenario with an illustrative shaded range"><svg viewBox="0 0 600 145" preserveAspectRatio="none"><polygon points={`470,${y(finalObserved)} 590,${y(upper)} 590,${y(lower)} 470,${y(finalObserved)}`} fill="#aab5a922" stroke="#aab5a9" strokeWidth="1"/><polyline points={observedPoints} fill="none" stroke="#e1ab73" strokeWidth="3"/><line x1="470" y1={y(finalObserved)} x2="590" y2={y(scenario)} stroke="#d8ddd3" strokeWidth="3" strokeDasharray="8 7"/><text x="8" y="140" fill="#9da79c" fontSize="10">Observed</text><text x="485" y="140" fill="#c3c9bd" fontSize="10">Scenario</text></svg></div>
    <details><summary>Assumptions and limitations</summary><ul><li>Linear continuation of a measured LOS trend relative to a reference point.</li><li>Selected annualized observed rate × rate multiplier × horizon is added to the latest observed fastest-zone mean.</li><li>The shaded range spans endpoints from the slowest and fastest observed interval rates; it is illustrative and not a statistical confidence interval.</li><li>Assumes no change in groundwater use, rainfall, policy, or geology.</li><li>No information about buildings or damage is available; no future consequence is inferred.</li></ul></details>
  </section>;
}

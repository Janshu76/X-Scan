"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImageSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { createTerraWatchMapStyle } from "@/regions/maps/mapStyle";
import type { MexicoSeries } from "@/regions/model";
import { formatDate, formatMonthYear } from "@/regions/model";
import { buildIntervals, signed } from "@/regions/mexico_city/analysis";

export type RegionDatasetDescription = {
  regionId: string;
  title: string;
  hasObservations: boolean;
  dataRoot: string;
  aoiUrl: string;
  seriesUrl: string;
  summaryUrl: string;
  pointsCsvUrl: string;
  overlayBoundsUrl: string;
  velocityOverlayUrl: string;
  cumulativeOverlayUrl: (date: string) => string;
};

export const mexicoCityDataset: RegionDatasetDescription = {
  regionId: "mexico_city",
  title: "Mexico City adjusted OPERA DISP-S1",
  hasObservations: true,
  dataRoot: "/data/regions/mexico_city",
  aoiUrl: "/data/regions/mexico_city/aoi.geojson",
  seriesUrl: "/data/regions/mexico_city/series.json",
  summaryUrl: "/data/regions/mexico_city/pack_summary.json",
  pointsCsvUrl: "/data/regions/mexico_city/timeseries_points.csv",
  overlayBoundsUrl: "/data/regions/mexico_city/overlay_bounds.json",
  velocityOverlayUrl: "/data/regions/mexico_city/overlay_velocity.png",
  cumulativeOverlayUrl: (date) => `/data/regions/mexico_city/overlay_${date}.png`,
};

type BoundsDoc = {
  "overlay_velocity.png"?: { corners_lonlat_TL_TR_BR_BL: [number, number][] };
  "overlay_cumulative_*.png"?: { corners_lonlat_TL_TR_BR_BL: [number, number][] };
};
type Sample = { id: string; lon: number; lat: number; velocity: number; values: number[] };
type Availability = { velocity: boolean; cumulative: boolean; hillshade: boolean; gnss: boolean; aoi: boolean };
type OverlayMode = "velocity" | "cumulative" | "none";
const EMPTY_DATES: string[] = [];

function parseSamples(csv: string): Sample[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const lonIndex = header.indexOf("lon"); const latIndex = header.indexOf("lat");
  const velocityIndex = header.indexOf("velocity_cm_yr");
  const valueIndices = header.map((name, index) => name.startsWith("cum_") ? index : -1).filter((index) => index >= 0);
  return lines.slice(1).map((line) => {
    const row = line.split(",");
    return { id: row[0], lon: Number(row[lonIndex]), lat: Number(row[latIndex]), velocity: Number(row[velocityIndex]), values: valueIndices.map((index) => Number(row[index])) };
  }).filter((sample) => Number.isFinite(sample.lon) && Number.isFinite(sample.lat) && Number.isFinite(sample.velocity) && sample.values.every(Number.isFinite));
}

function nearestSample(samples: Sample[], lon: number, lat: number) {
  if (!samples.length) return null;
  return samples.reduce((nearest, sample) => {
    const dx = (sample.lon - lon) * Math.cos(lat * Math.PI / 180);
    const dy = sample.lat - lat;
    const bestDx = (nearest.lon - lon) * Math.cos(lat * Math.PI / 180);
    const bestDy = nearest.lat - lat;
    return dx * dx + dy * dy < bestDx * bestDx + bestDy * bestDy ? sample : nearest;
  });
}

export default function EarthTimeMachine({ dataset, view }: { dataset: RegionDatasetDescription; view: "public" | "research" }) {
  const [series, setSeries] = useState<MexicoSeries | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [velocityCorners, setVelocityCorners] = useState<[number, number][]>([]);
  const [cumulativeCorners, setCumulativeCorners] = useState<[number, number][]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [availability, setAvailability] = useState<Availability>({ velocity: false, cumulative: false, hillshade: false, gnss: false, aoi: false });
  const [dateIndex, setDateIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [compare, setCompare] = useState(false);
  const [swipe, setSwipe] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<OverlayMode>("velocity");
  const [layersOpen, setLayersOpen] = useState(false);
  const [hillshade, setHillshade] = useState(false);
  const [gnss, setGnss] = useState(true);
  const [aoi, setAoi] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<{ sample: Sample; lon: number; lat: number } | null>(null);
  const mapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const maps = useRef<MapLibreMap[]>([]);
  const current = useRef({ dateIndex, compareIndex, mode, hillshade, gnss, aoi, compare });
  const swipeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    current.current = { dateIndex, compareIndex, mode, hillshade, gnss, aoi, compare };
  }, [dateIndex, compareIndex, mode, hillshade, gnss, aoi, compare]);

  useEffect(() => {
    if (!dataset.hasObservations) return;
    let active = true;
    Promise.all([
      fetch(dataset.seriesUrl).then((r) => r.ok ? r.json() as Promise<MexicoSeries> : null),
      fetch(dataset.summaryUrl).then((r) => r.ok ? r.json() as Promise<Record<string, unknown>> : null),
      fetch(dataset.overlayBoundsUrl).then((r) => r.ok ? r.json() as Promise<BoundsDoc> : null),
      fetch(dataset.pointsCsvUrl).then((r) => r.ok ? r.text() : ""),
      fetch(dataset.velocityOverlayUrl, { method: "HEAD" }).then((r) => r.ok),
      fetch(dataset.aoiUrl, { method: "HEAD" }).then((r) => r.ok),
      Promise.all([fetch(`${dataset.dataRoot}/context/dem_info.json`).then((r) => r.ok), fetch(`${dataset.dataRoot}/context/hillshade_overlay.png`, { method: "HEAD" }).then((r) => r.ok)]).then(([dem, image]) => dem && image),
      fetch(`${dataset.dataRoot}/context/gnss.json`).then((r) => r.ok),
    ]).then(async ([loadedSeries, loadedSummary, bounds, csv, hasVelocity, hasAoi, hasHillshade, hasGnss]) => {
      if (!active) return;
      if (!loadedSeries) throw new Error("This dataset's time-series metadata is unavailable.");
      const cumulativeFiles = await Promise.all(loadedSeries.dates.map((date) => fetch(dataset.cumulativeOverlayUrl(date), { method: "HEAD" }).then((response) => response.ok)));
      const hasCumulative = cumulativeFiles.length > 0 && cumulativeFiles.every(Boolean);
      setSeries(loadedSeries);
      setSummary(loadedSummary);
      setSamples(parseSamples(csv));
      setAvailability({ velocity: hasVelocity, cumulative: hasCumulative, hillshade: hasHillshade, gnss: hasGnss, aoi: hasAoi });
      setMode(hasVelocity ? "velocity" : hasCumulative ? "cumulative" : "none");
      setVelocityCorners(bounds?.["overlay_velocity.png"]?.corners_lonlat_TL_TR_BR_BL ?? []);
      setCumulativeCorners(bounds?.["overlay_cumulative_*.png"]?.corners_lonlat_TL_TR_BR_BL ?? []);
      setCompareIndex(Math.max(0, loadedSeries.dates.length - 1));
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [dataset]);

  const dates = series?.dates ?? EMPTY_DATES;
  const selectedDate = dates[dateIndex];
  const firstTime = dates.length ? Date.parse(`${dates[0].slice(0, 4)}-${dates[0].slice(4, 6)}-${dates[0].slice(6, 8)}T00:00:00Z`) : 0;
  const lastTime = dates.length ? Date.parse(`${dates.at(-1)!.slice(0, 4)}-${dates.at(-1)!.slice(4, 6)}-${dates.at(-1)!.slice(6, 8)}T00:00:00Z`) : 1;
  const intervals = useMemo(() => series ? buildIntervals(series) : [], [series]);
  const ranges = summary?.colour_limits as { cumulative_cm?: number; velocity_cm_yr?: number } | undefined;
  const colorLimit = mode === "velocity" ? ranges?.velocity_cm_yr ?? 25 : ranges?.cumulative_cm ?? 85;

  const overlayUrl = useCallback((index: number) => {
    if (mode === "velocity") return dataset.velocityOverlayUrl;
    return dates[index] ? dataset.cumulativeOverlayUrl(dates[index]) : "";
  }, [dataset, dates, mode]);

  useEffect(() => {
    if (!series || !cumulativeCorners.length || !velocityCorners.length) return;
    let disposed = false;
    const made: MapLibreMap[] = [];
    import("maplibre-gl").then(({ Map, NavigationControl }) => {
      if (disposed) return;
      const addDataLayers = async (map: MapLibreMap, mapIndex: number) => {
        const dateIndexNow = mapIndex === 0 ? current.current.dateIndex : current.current.compareIndex;
        const overlayMode = current.current.mode;
        const baselineOnly = overlayMode === "cumulative" && dateIndexNow === 0;
        map.addSource("region-aoi", { type: "geojson", data: dataset.aoiUrl });
        map.addLayer({ id: "region-aoi-line", type: "line", source: "region-aoi", paint: { "line-color": "#f4ca8a", "line-width": 1.6, "line-dasharray": [2, 2] } });
        const imageCorners = overlayMode === "velocity" ? velocityCorners : cumulativeCorners;
        map.addSource("region-overlay", { type: "image", url: overlayUrl(dateIndexNow), coordinates: imageCorners as [[number, number], [number, number], [number, number], [number, number]] });
        map.addLayer({ id: "region-overlay-layer", type: "raster", source: "region-overlay", layout: { visibility: overlayMode !== "none" && !(overlayMode === "cumulative" && dateIndexNow === 0) ? "visible" : "none" }, paint: { "raster-opacity": 0.82, "raster-fade-duration": 0 } });
        map.setLayoutProperty("region-aoi-line", "visibility", current.current.aoi ? "visible" : "none");
        const [demResponse, gnssResponse] = await Promise.all([fetch(`${dataset.dataRoot}/context/dem_info.json`), fetch(`${dataset.dataRoot}/context/gnss.json`)]);
        if (demResponse.ok) {
          const dem = await demResponse.json() as { bounds_lonlat_west_south_east_north?: [number, number, number, number] };
          const b = dem.bounds_lonlat_west_south_east_north;
          if (b) {
            map.addSource("terrain", { type: "image", url: `${dataset.dataRoot}/context/hillshade_overlay.png`, coordinates: [[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]]] });
            map.addLayer({ id: "terrain-layer", type: "raster", source: "terrain", layout: { visibility: current.current.hillshade && !baselineOnly ? "visible" : "none" }, paint: { "raster-opacity": 0.4 } }, "region-overlay-layer");
          }
        }
        if (gnssResponse.ok) {
          const source = await gnssResponse.json() as { stations?: { station: string; lat: number; lon: number }[] };
          const features = (source.stations ?? []).map((station) => ({ type: "Feature" as const, properties: { station: station.station }, geometry: { type: "Point" as const, coordinates: [station.lon, station.lat] } }));
          map.addSource("gnss-stations", { type: "geojson", data: { type: "FeatureCollection", features } });
          map.addLayer({ id: "gnss-station-points", type: "circle", source: "gnss-stations", layout: { visibility: current.current.gnss && !baselineOnly ? "visible" : "none" }, paint: { "circle-radius": 5, "circle-color": "#86d5c8", "circle-stroke-width": 1.5, "circle-stroke-color": "#132129" } });
          map.addLayer({ id: "gnss-station-labels", type: "symbol", source: "gnss-stations", layout: { visibility: current.current.gnss && !baselineOnly ? "visible" : "none", "text-field": ["get", "station"], "text-offset": [0, 1.2], "text-size": 10 }, paint: { "text-color": "#dcf4e9", "text-halo-color": "#101820", "text-halo-width": 1.4 } });
        }
      };
      mapRefs.current.forEach((container, index) => {
        if (!container) return;
        const map = new Map({ container, style: createTerraWatchMapStyle(), center: [-99.12, 19.4], zoom: 9, maxZoom: 15, attributionControl: { compact: true } });
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => { void addDataLayers(map, index).catch(() => setError("A Mexico map context layer could not be loaded; unavailable layers remain off.")); });
        map.on("click", (event: MapMouseEvent) => {
          const sample = nearestSample(samples, event.lngLat.lng, event.lngLat.lat);
          if (sample) setPicked({ sample, lon: event.lngLat.lng, lat: event.lngLat.lat });
        });
        made.push(map);
      });
      maps.current = made;
      if (made.length === 2) {
        let syncing = false;
        const sync = (source: MapLibreMap, target: MapLibreMap) => {
          if (syncing) return;
          syncing = true;
          target.jumpTo({ center: source.getCenter(), zoom: source.getZoom(), bearing: source.getBearing(), pitch: source.getPitch() });
          syncing = false;
        };
        made[0].on("move", () => sync(made[0], made[1]));
        made[1].on("move", () => sync(made[1], made[0]));
      }
    }).catch(() => setError("The interactive map could not be initialized."));
    return () => { disposed = true; maps.current.forEach((map) => map.remove()); maps.current = []; };
  }, [series, velocityCorners, cumulativeCorners, dataset, samples, overlayUrl, compare]);

  useEffect(() => {
    maps.current.forEach((map, index) => {
      const idx = index === 0 ? dateIndex : compareIndex;
      const source = map.getSource("region-overlay") as ImageSource | undefined;
      const mapCorners = mode === "velocity" ? velocityCorners : cumulativeCorners;
      if (source && overlayUrl(idx)) source.updateImage({ url: overlayUrl(idx), coordinates: mapCorners as [[number, number], [number, number], [number, number], [number, number]] });
      if (map.getLayer("region-overlay-layer")) map.setLayoutProperty("region-overlay-layer", "visibility", mode !== "none" && !(mode === "cumulative" && idx === 0) ? "visible" : "none");
      if (map.getLayer("region-aoi-line")) {
        map.setLayoutProperty("region-aoi-line", "visibility", aoi ? "visible" : "none");
      }
      const baselineOnly = mode === "cumulative" && idx === 0;
      for (const [id, visible] of [["terrain-layer", hillshade && !baselineOnly], ["gnss-station-points", gnss && !baselineOnly], ["gnss-station-labels", gnss && !baselineOnly]] as const) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    });
  }, [dateIndex, compareIndex, mode, hillshade, gnss, aoi, overlayUrl, velocityCorners, cumulativeCorners]);

  useEffect(() => {
    if (!playing || !dates.length || mode !== "cumulative") return;
    const timer = window.setInterval(() => setDateIndex((value) => (value + 1) % dates.length), 1350);
    return () => window.clearInterval(timer);
  }, [playing, dates.length, mode]);

  const setTimelineTime = (value: number) => {
    if (!dates.length) return;
    const closest = dates.reduce((best, date, index) => {
      const time = Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`);
      const bestTime = Date.parse(`${dates[best].slice(0, 4)}-${dates[best].slice(4, 6)}-${dates[best].slice(6, 8)}T00:00:00Z`);
      return Math.abs(time - value) < Math.abs(bestTime - value) ? index : best;
    }, 0);
    setDateIndex(closest);
  };
  const onSwipePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); };
  const onSwipePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !swipeRef.current) return;
    const rect = swipeRef.current.getBoundingClientRect();
    setSwipe(Math.min(95, Math.max(5, ((event.clientX - rect.left) / rect.width) * 100)));
  };

  if (!dataset.hasObservations) return <section className="planned-region-panel"><b>Unavailable · no observations loaded</b><p>{dataset.title} has no registered observation series yet.</p></section>;
  const cumulativeValue = series?.series_fastest_1pct_cm[dateIndex];
  const publicTakeaway = selectedDate && cumulativeValue !== undefined
    ? `${formatMonthYear(selectedDate)}: the strongest-moving area in the sample shows about ${Math.abs(cumulativeValue).toFixed(1)} cm of change since the first date.`
    : "Loading the selected date's measured change…";

  return <section className="earth-time-machine" id="time-machine" aria-labelledby="time-machine-title">
    <div className="machine-header"><div><p className="eyebrow">EARTH TIME MACHINE · OBSERVED</p><h2 id="time-machine-title">{dataset.title}</h2><p>{view === "public" ? "Move through the dates to see how the measured ground-motion pattern changes." : `${series?.units ?? "Loading units…"} · ${series?.crs ?? "Loading CRS…"}`}</p></div><div className="machine-mode-switch" role="group" aria-label="Map display"><button type="button" aria-pressed={mode === "velocity"} onClick={() => setMode("velocity")}>Rate map</button><button type="button" aria-pressed={mode === "cumulative"} onClick={() => setMode("cumulative")}>Date map</button></div></div>
    <div className="machine-stage" ref={swipeRef} onPointerMove={onSwipePointerMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
      <div className="machine-map" ref={(element) => { mapRefs.current[0] = element; }} />
      {compare && <div className="machine-compare-clip" style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}><div className="machine-map" ref={(element) => { mapRefs.current[1] = element; }} /></div>}
      <div className="machine-map-label left">{mode === "velocity" ? "Mean rate · cm/year LOS" : dateIndex === 0 ? "Baseline: zero by definition" : formatDate(selectedDate ?? "")}</div>
      {compare && <div className="machine-map-label right">{compareIndex === 0 ? "Baseline: zero by definition" : formatDate(dates[compareIndex] ?? "")}</div>}
      {compare && <><div className="machine-swipe-line" style={{ left: `${swipe}%` }}/><button className="machine-swipe-handle" style={{ left: `${swipe}%` }} onPointerDown={onSwipePointerDown} aria-label="Drag to compare dates" title="Drag to compare dates">↔</button></>}
      <button className="machine-layers-button" onClick={() => setLayersOpen((open) => !open)} aria-expanded={layersOpen}>Map layers {layersOpen ? "−" : "+"}</button>
      {layersOpen && <div className="machine-layers"><b>MAP LAYERS</b>
        <label><input type="checkbox" checked={mode === "velocity"} disabled={!availability.velocity} onChange={(event) => setMode(event.target.checked ? "velocity" : "none")}/> {view === "public" ? "Rate overlay" : "Velocity overlay · cm/year LOS"} {!availability.velocity && <small>Unavailable: velocity overlay file is missing.</small>}</label>
        <label><input type="checkbox" checked={mode === "cumulative"} disabled={!availability.cumulative} onChange={(event) => setMode(event.target.checked ? "cumulative" : "none")}/> {view === "public" ? "Change through time" : "Cumulative LOS dates · cm"} {!availability.cumulative && <small>Unavailable: cumulative overlay files are missing.</small>}</label>
        <label><input type="checkbox" checked={hillshade} disabled={!availability.hillshade} onChange={(event) => setHillshade(event.target.checked)}/> Hillshade {!availability.hillshade && <small>Unavailable: DEM preview file is missing.</small>}</label>
        <label><input type="checkbox" checked={gnss} disabled={!availability.gnss} onChange={(event) => setGnss(event.target.checked)}/> GNSS stations {!availability.gnss && <small>Unavailable: station file is missing.</small>}</label>
        <label title="Unavailable: no roads or facilities vector file was added."><input type="checkbox" disabled/> Roads and facilities <small>Unavailable: no vector export is present.</small></label>
        <label><input type="checkbox" checked={aoi} disabled={!availability.aoi} onChange={(event) => setAoi(event.target.checked)}/> Study-area outline {!availability.aoi && <small>Unavailable: study-area outline file is missing.</small>}</label>
        <small>© OpenStreetMap contributors · ODbL</small>
      </div>}
      {picked && <div className="machine-inspector"><button onClick={() => setPicked(null)} aria-label="Close sample inspection">×</button><b>Approximate nearest sample · point {picked.sample.id}</b><span>{picked.sample.lat.toFixed(4)}° N, {Math.abs(picked.sample.lon).toFixed(4)}° W</span><span>{formatDate(selectedDate ?? "")} · {picked.sample.values[dateIndex].toFixed(2)} cm LOS</span><span>Rate: {picked.sample.velocity.toFixed(2)} cm/year LOS</span></div>}
      {error && <p className="machine-error" role="status">{error}</p>}
    </div>
    <div className="machine-legend"><div><span>−{colorLimit} {mode === "velocity" ? "cm/yr" : "cm"}</span><i/><b>0</b><i/><span>+{colorLimit} {mode === "velocity" ? "cm/yr" : "cm"}</span></div><small>Values beyond ±{colorLimit} {mode === "velocity" ? "cm/year" : "cm"} are saturated.</small></div>
    <p className="machine-caveat-chip">Line of sight, relative to estimated stable ground</p>
    <div className="machine-controls"><div className="machine-control-heading"><div><span>Selected date</span><b>{selectedDate ? formatDate(selectedDate) : "Loading dates…"}</b></div><div className="machine-buttons"><button className="quiet-button" aria-pressed={compare} onClick={() => { const next = !compare; setCompare(next); if (next) setMode("cumulative"); }}>{compare ? "Hide compare" : "Compare dates"}</button><button className="play-button" disabled={!series} onClick={() => { if (mode !== "cumulative") setMode("cumulative"); setPlaying((value) => !value); }}>{playing ? "Pause" : "Play"}</button></div></div>
      <div className="machine-timeline"><input aria-label="Select acquisition date" type="range" min={firstTime} max={lastTime} step="1" value={selectedDate ? Date.parse(`${selectedDate.slice(0, 4)}-${selectedDate.slice(4, 6)}-${selectedDate.slice(6, 8)}T00:00:00Z`) : firstTime} onChange={(event) => setTimelineTime(Number(event.target.value))}/><div className="machine-ticks">{dates.map((date, index) => { const time = Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`); const left = lastTime > firstTime ? ((time - firstTime) / (lastTime - firstTime)) * 100 : 0; return <button key={date} style={{ left: `${left}%` }} className={index === dateIndex ? "selected" : ""} title={formatDate(date)} onClick={() => setDateIndex(index)}>{formatMonthYear(date)}</button>; })}</div></div>
      {compare && <label className="machine-compare-date"><span>Compare against</span><select value={compareIndex} onChange={(event) => setCompareIndex(Number(event.target.value))}>{dates.map((date, index) => <option key={date} value={index}>{index === 0 ? "Baseline: zero by definition" : formatDate(date)}</option>)}</select><span>Drag the map handle to reveal the comparison date.</span></label>}
    </div>
    {view === "public" ? <p className="machine-takeaway">{publicTakeaway}</p> : <details className="machine-research-details" open><summary>Research metadata, block history, and quality notes</summary><dl><dt>Dataset</dt><dd>{series?.product ?? "Unavailable"}</dd><dt>Dates</dt><dd>{dates.map(formatDate).join(" · ") || "Unavailable"}</dd><dt>Units</dt><dd>{series?.units ?? "Unavailable"}</dd><dt>CRS</dt><dd>{series?.crs ?? "Unavailable"}</dd><dt>Block references</dt><dd>{series?.blocks?.map((block) => `${block.start}–${block.end}: ${block.reference_shift_removed_cm} cm`).join("; ") ?? "Unavailable"}</dd><dt>Quality notes</dt><dd>{series?.quality_notes?.join(" ") ?? "Unavailable"}</dd><dt>Full caveat</dt><dd>{series?.caveat ?? "Unavailable"}</dd></dl></details>}
    <section className="machine-intervals"><div className="card-top"><span className="section-kicker">{view === "public" ? "CHANGE BETWEEN DATES" : "INTERVAL RATE"}</span><span className="status-tag muted">{view === "public" ? "SAMPLE TREND" : "APPROXIMATE SAMPLE SERIES"}</span></div><p>{view === "public" ? "Change between each pair of observation dates." : "Annualized rates from the sampled most-subsiding 1% cumulative LOS series; dates have unequal gaps."}</p><div className="machine-rate-bars" style={{ gridTemplateColumns: `repeat(${Math.max(1, intervals.length)}, minmax(45px, 1fr))` }}>{intervals.map((item) => { const extent = Math.max(1, ...intervals.map((interval) => Math.abs(interval.fastestRateCmPerYear))); return <button key={item.from} title={`${item.label}: ${signed(item.fastestRateCmPerYear)} cm/year LOS`} onClick={() => { setDateIndex(item.index + 1); setMode("cumulative"); }}><span>{formatMonthYear(item.to)}</span><i style={{ height: `${Math.max(4, Math.abs(item.fastestRateCmPerYear) / extent * 72)}px` }} className={item.fastestRateCmPerYear < 0 ? "negative" : "positive"}/><small>{signed(item.fastestRateCmPerYear)}</small></button>; })}</div></section>
  </section>;
}

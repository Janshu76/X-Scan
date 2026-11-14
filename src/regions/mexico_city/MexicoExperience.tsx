"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ImageSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { MexicoSeries } from "@/regions/model";
import { formatDate, formatMonthYear, mexicoLayers } from "@/regions/model";

const dataRoot = "/data/regions/mexico_city";
type SelectedPoint = { lat: number; lon: number; values?: (number | null)[] | null };
const tileStyle = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm", paint: { "raster-saturation": -0.82, "raster-contrast": 0.12, "raster-brightness-max": 0.62 } }],
};

export default function MexicoExperience() {
  const [series, setSeries] = useState<MexicoSeries | null>(null);
  const [error, setError] = useState("");
  const [dateIndex, setDateIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(9);
  const [playing, setPlaying] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ displacement: true, aoi: true });
  const [point, setPoint] = useState<SelectedPoint | null>(null);
  const [inspectionGrid, setInspectionGrid] = useState<InspectionGrid | null>(null);
  const [seriesChart, setSeriesChart] = useState(false);
  const maps = useRef<MapLibreMap[]>([]);
  const mapRefs = useRef<(HTMLDivElement | null)[]>([]);
  const currentDateIndexes = useRef({ dateIndex, compareIndex });
  const currentLayers = useRef(enabled);

  useEffect(() => {
    fetch(`${dataRoot}/series.json`).then((response) => {
      if (!response.ok) throw new Error("The Mexico City series metadata could not be loaded.");
      return response.json() as Promise<MexicoSeries>;
    }).then(setSeries).catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    fetch(`${dataRoot}/inspection_grid.json`).then((response) => response.ok ? response.json() as Promise<InspectionGrid> : null)
      .then(setInspectionGrid).catch(() => setInspectionGrid(null));
  }, []);

  useEffect(() => {
    currentDateIndexes.current = { dateIndex, compareIndex };
  }, [dateIndex, compareIndex]);

  useEffect(() => {
    currentLayers.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!series || !playing) return;
    const timer = window.setInterval(() => setDateIndex((current) => (current + 1) % series.dates.length), 1350);
    return () => window.clearInterval(timer);
  }, [playing, series]);

  useEffect(() => {
    if (!series) return;
    let disposed = false;
    const created: MapLibreMap[] = [];
    import("maplibre-gl").then(({ Map, NavigationControl }) => {
      if (disposed) return;
      const [west, south, east, north] = series.bounds_lonlat_west_south_east_north;
      const imageCoordinates: [[number, number], [number, number], [number, number], [number, number]] = [
        [west, north], [east, north], [east, south], [west, south],
      ];
      mapRefs.current.forEach((container, index) => {
        if (!container) return;
        const map = new Map({
          container,
          style: tileStyle,
          bounds: [[west, south], [east, north]],
          fitBoundsOptions: { padding: 38 },
          maxZoom: 15,
          attributionControl: { compact: true },
        });
        map.addControl(new NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          map.addSource("mexico-aoi", { type: "geojson", data: `${dataRoot}/aoi.geojson` });
          map.addLayer({ id: "aoi-fill", type: "fill", source: "mexico-aoi", paint: { "fill-color": "#efbc70", "fill-opacity": 0.035 } });
          map.addLayer({ id: "aoi-line", type: "line", source: "mexico-aoi", paint: { "line-color": "#f4ca8a", "line-width": 1.5, "line-dasharray": [2, 2] } });
          const selectedIndex = index === 0 ? currentDateIndexes.current.dateIndex : currentDateIndexes.current.compareIndex;
          const initialDate = series.dates[selectedIndex];
          map.addSource("displacement-image", { type: "image", url: `${dataRoot}/overlay_${initialDate}.png`, coordinates: imageCoordinates });
          const visibleLayers = currentLayers.current;
          map.addLayer({ id: "displacement-layer", type: "raster", source: "displacement-image", layout: { visibility: visibleLayers.displacement && selectedIndex !== 0 ? "visible" : "none" }, paint: { "raster-opacity": 0.78, "raster-fade-duration": 0 } });
          map.setLayoutProperty("aoi-line", "visibility", visibleLayers.aoi ? "visible" : "none");
          map.setLayoutProperty("aoi-fill", "visibility", visibleLayers.aoi ? "visible" : "none");
          map.setLayoutProperty("displacement-layer", "visibility", visibleLayers.displacement && selectedIndex !== 0 ? "visible" : "none");
        });
        map.on("click", (event: MapMouseEvent) => {
          const location = { lat: event.lngLat.lat, lon: event.lngLat.lng };
          const sampled = inspectionGrid ? lookupGrid(inspectionGrid, location.lat, location.lon) : undefined;
          setPoint(sampled ? { ...location, values: sampled } : location);
        });
        created.push(map);
      });
      maps.current = created;
      if (created.length === 2) {
        let syncing = false;
        created[0].on("move", () => {
          if (syncing) return;
          syncing = true;
          created[1].jumpTo({ center: created[0].getCenter(), zoom: created[0].getZoom(), bearing: created[0].getBearing(), pitch: created[0].getPitch() });
          syncing = false;
        });
        created[1].on("move", () => {
          if (syncing) return;
          syncing = true;
          created[0].jumpTo({ center: created[1].getCenter(), zoom: created[1].getZoom(), bearing: created[1].getBearing(), pitch: created[1].getPitch() });
          syncing = false;
        });
      }
    }).catch(() => setError("MapLibre could not be initialized."));
    return () => {
      disposed = true;
      maps.current.forEach((map) => map.remove());
      maps.current = [];
    };
  // Map creation is tied to the loaded dataset; layer and date changes use the update effects below.
  }, [series, inspectionGrid]);

  useEffect(() => {
    if (!series) return;
    maps.current.forEach((map, index) => {
      const source = map.getSource("displacement-image") as ImageSource | undefined;
      const selectedIndex = index === 0 ? dateIndex : compareIndex;
      if (source) {
        const date = series.dates[selectedIndex];
        source.updateImage({ url: `${dataRoot}/overlay_${date}.png` });
      }
      if (map.getLayer("displacement-layer")) {
        map.setLayoutProperty("displacement-layer", "visibility", enabled.displacement && selectedIndex !== 0 ? "visible" : "none");
      }
    });
  }, [dateIndex, compareIndex, enabled.displacement, series]);

  useEffect(() => {
    maps.current.forEach((map) => {
      if (!map.getLayer("aoi-line")) return;
      map.setLayoutProperty("aoi-line", "visibility", enabled.aoi ? "visible" : "none");
      map.setLayoutProperty("aoi-fill", "visibility", enabled.aoi ? "visible" : "none");
      const index = maps.current.indexOf(map);
      const selectedIndex = index === 0 ? dateIndex : compareIndex;
      map.setLayoutProperty("displacement-layer", "visibility", enabled.displacement && selectedIndex !== 0 ? "visible" : "none");
    });
  }, [enabled, dateIndex, compareIndex]);

  const selectedDate = series?.dates[dateIndex];
  const stats = useMemo(() => {
    if (!series) return null;
    return {
      valid: `${(series.valid_pixel_fraction * 100).toFixed(1)}%`,
      rate: Math.abs(series.mean_rate_cm_per_year_fastest_1pct).toFixed(1),
      total: Math.abs(series.series_fastest_1pct_cm.at(-1) ?? 0).toFixed(0),
      wholeSceneRate: formatSignedRate(annualizedEndpointRate(series.dates, series.series_scene_median_cm)),
      min: Math.min(...series.series_fastest_1pct_cm),
      max: Math.max(...series.series_fastest_1pct_cm),
    };
  }, [series]);

  return <>
    <section className="dashboard-grid">
      <div className="map-column">
        <div className="map-toolbar"><div className="map-heading"><span className="section-kicker">EARTH TIME MACHINE</span><b>Line-of-sight displacement</b><span>Sentinel-1 · OPERA L3 DISP-S1 · frame 20688</span></div><button className="quiet-button" onClick={() => setLayersOpen((value) => !value)}>{layersOpen ? "Hide layers" : "Show layers"} <span>＋</span></button></div>
        <div className="map-comparison">
          {[dateIndex, compareIndex].map((index, mapIndex) => <div className="map-pane" key={mapIndex}>
            <div className={`pane-label ${series && series.dates[index] === series.dates[0] ? "baseline-label" : ""}`}><span>{mapIndex === 0 ? "A · OBSERVED" : "B · COMPARE"}</span><strong>{series ? (series.dates[index] === series.dates[0] ? "Baseline: zero by definition" : formatDate(series.dates[index])) : "Loading"}</strong></div>
            <div className="map-canvas" ref={(element) => { mapRefs.current[mapIndex] = element; }} />
            {mapIndex === 0 && layersOpen && <aside className="layers-card"><div className="layers-title">MAP LAYERS <span>LIVE</span></div>{mexicoLayers.map((layer) => <label className={`layer-row ${layer.status === "not-added" ? "disabled" : ""}`} key={layer.id} title={layer.reason}>
              <input type="checkbox" checked={Boolean(enabled[layer.id])} disabled={layer.status !== "available"} onChange={(event) => setEnabled((current) => ({ ...current, [layer.id]: event.target.checked }))}/><span>{layer.title}</span>{layer.status === "not-added" && <small>NOT ADDED</small>}
            </label>)}<p className="layer-attribution">© OpenStreetMap contributors · ODbL</p></aside>}
          </div>)}
          <div className="map-divider" aria-hidden="true"><span>COMPARE</span></div>
          {error && <div className="map-error">{error}</div>}
        </div>
        <div className="legend-row"><div className="legend"><span>−{Math.abs(series?.color_range_cm[0] ?? 65)} cm</span><div className="legend-scale"><span className="legend-bar" aria-hidden="true"/><span className="legend-zero">0</span></div><span>+{series?.color_range_cm[1] ?? 65} cm</span></div><p>Negative values are consistent with motion away from the satellite. Values beyond ±65 cm are saturated.</p></div>
        <div className="timeline-block"><div className="timeline-head"><div><span className="section-kicker">OBSERVATION DATE</span><strong>{selectedDate ? formatDate(selectedDate) : "Loading series…"}</strong></div><button className="play-button" onClick={() => setPlaying((value) => !value)} disabled={!series}>{playing ? "Ⅱ Pause" : "▶ Play"}</button></div>
          <input aria-label="Select displacement date" className="timeline" type="range" min={0} max={(series?.dates.length ?? 1) - 1} value={dateIndex} onChange={(event) => setDateIndex(Number(event.target.value))} disabled={!series}/>
          <div className="date-ticks">{series?.dates.map((date, index) => <button className={index === dateIndex ? "selected" : ""} key={date} title={formatDate(date)} aria-label={`Show ${formatDate(date)}`} onClick={() => setDateIndex(index)}>{formatMonthYear(date)}</button>)}</div>
          <div className="compare-control"><label htmlFor="compare-date">Compare with</label><select id="compare-date" value={compareIndex} onChange={(event) => setCompareIndex(Number(event.target.value))}>{series?.dates.map((date, index) => <option value={index} key={date}>{formatDate(date)}</option>)}</select><span>Two maps share the same extent for visual comparison.</span></div>
        </div>
        <p className="caveat-inline"><b>Reading this map:</b> {series?.caveat ?? "Loading data caveats…"} LOS is not vertical movement. The blue or positive western signal is not interpreted as uplift; atmospheric delay and reference-point effects may contribute.</p>
      </div>

      <aside className="insight-column">
        <section className="card observed-card"><div className="card-top"><span className="section-kicker">CHANGE DETECTIVE</span><span className="status-tag">OBSERVED</span></div><h2>A city changing<br/>beneath the surface.</h2><p className="card-copy">The −{stats?.rate ?? "…"} cm/yr headline is the mean LOS rate across the most-subsiding 1% of valid pixels. Their cumulative mean change is <b>{stats ? `−${stats.total} cm` : "…"}</b> over the observation period.</p><div className="rate-pair"><div className="rate-metric headline-rate"><strong>{stats ? `−${stats.rate}` : "…"}</strong><span>cm / year LOS<br/>most-subsiding 1%<br/>pixel mean rate</span></div><div className="rate-metric"><strong>{stats?.wholeSceneRate ?? "…"}</strong><span>cm / year LOS<br/>whole-scene median<br/>rate across period</span></div></div><p className="micro-note median-note">The whole-scene median rate is annualized from the first and last values in <code>series_scene_median_cm</code>. Positive LOS is not interpreted as vertical uplift.</p><div className="sparkline-wrap"><Sparkline values={series?.series_fastest_1pct_cm ?? []}/><div className="sparkline-labels"><span>Mar 2022</span><span>Feb 2026</span></div></div><div className="stat-footer"><span>Valid in every block</span><b>{stats?.valid ?? "…"}</b></div><p className="micro-note">Separate statistic: the most negative single pixel is {series ? `${series.fastest_pixel_final_cm.toFixed(1)} cm LOS` : "…"}; this is not the fastest-zone mean.</p></section>
        <section className="card hypothesis-card"><div className="card-top"><span className="section-kicker">POSSIBLE EXPLANATIONS</span><span className="status-tag muted">HYPOTHESES</span></div><p>Mexico City overlies soft lake-bed clays. Published research identifies groundwater extraction as a major possible contributor to compaction, alongside urban loading and local geology.</p><p className="limitation">This project has no groundwater levels, pumping data, or geotechnical maps. It cannot test these explanations. Atmospheric delay, reference-point effects, unwrapping errors, and seasonal effects may also shape the signal.</p><div className="reference-note">READ MORE <span>Cigna &amp; Tapete (2021) · Chaussard et al. (2014)</span></div></section>
        <section className="card impact-card"><div className="card-top"><span className="section-kicker">EARTH IMPACT EXPLORER</span><span className="status-tag muted">WAITING FOR DATA</span></div><h3>Exposure counts</h3><p>Road and facility exports are not available, so no counts or lengths are calculated. Observed displacement does not establish damage or risk.</p></section>
      </aside>
    </section>

    <section className="lower-grid">
      <div className="card point-card"><div className="card-top"><span className="section-kicker">CLICK TO INSPECT</span><span className={`status-tag ${inspectionGrid ? "" : "muted"}`}>{inspectionGrid ? "APPROXIMATE GRID" : "SAMPLE GRID NOT ADDED"}</span></div><h3>{point ? "Map point selected" : "Inspect a location"}</h3><p>{point ? `${point.lat.toFixed(4)}° N, ${Math.abs(point.lon).toFixed(4)}° W` : "Click a point on either map to see its coordinates and LOS series."}</p>{point?.values ? <div className="point-series"><b>{point.values.at(-1) == null ? "No reliable sample at this point" : `${point.values.at(-1)?.toFixed(1)} cm LOS · final date`}</b><span>Approximate nearest sample from an 8× decimated grid.</span>{point.values.map((value, index) => <i key={index}>{series ? formatDate(series.dates[index]) : ""}: {value === null ? "no data" : `${value.toFixed(1)} cm`}</i>)}</div> : inspectionGrid && point ? <div className="empty-inline">This location is outside the sampled raster bounds; no displacement value is reported.</div> : <div className="empty-inline">The exported GeoTIFF time-series grid is outside the repository. Run <code>python pipeline/build_inspection_grid.py --input-dir ../out/mexico_city --output data/samples/mexico_city/inspection_grid.json</code> to create the compact approximate grid; without it, point displacement values are withheld.</div>}</div>
      <div className="card lab-card"><div className="card-top"><span className="section-kicker">SAR INTELLIGENCE LAB</span><span className="status-tag muted">NISAR AVAILABILITY ONLY</span></div><h3>Sentinel-1 today. NISAR when verified.</h3><p>The displacement shown here comes from Sentinel-1 OPERA DISP-S1. NISAR displacement has not been downloaded or processed.</p><div className="empty-inline">No NISAR search-results CSV is present, so coverage and dates cannot be reported yet.</div><button className="text-action" onClick={() => setSeriesChart((value) => !value)}>{seriesChart ? "Hide" : "View"} data lineage ↓</button>{seriesChart && <p className="lineage">Sentinel-1 observations → OPERA L3 DISP-S1 frame 20688, VV → chained cumulative LOS series → date overlays. Ten acquisitions span Mar 2022 to Feb 2026. Blocks are chained by summation and can retain small reference drift.</p>}</div>
      <div className="card next-data-card"><div className="card-top"><span className="section-kicker">NEXT DATA TO ADD</span><span className="status-tag muted">MEXICO CITY</span></div><ul><li>Groundwater levels and well data</li><li>Geotechnical and lake-zone maps</li><li>Roads, facilities, terrain and GNSS exports</li><li>Building counts by grid cell</li></ul></div>
    </section>
  </>;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="spark-placeholder">Series will appear when metadata loads.</div>;
  const width = 280; const height = 62; const lo = Math.min(...values); const hi = Math.max(...values); const span = hi - lo || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${4 + ((hi - value) / span) * (height - 8)}`).join(" ");
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fastest one percent displacement series"><polyline points={points} fill="none" stroke="#e7a86b" strokeWidth="2.5"/><circle cx={width} cy={4 + ((hi - values.at(-1)!) / span) * (height - 8)} r="3" fill="#e7a86b"/></svg>;
}

function annualizedEndpointRate(dates: string[], values: number[]) {
  if (dates.length < 2 || values.length < 2) return null;
  const toTimestamp = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
  const years = (toTimestamp(dates.at(-1)!) - toTimestamp(dates[0])) / (365.25 * 24 * 60 * 60 * 1000);
  return years > 0 ? (values.at(-1)! - values[0]) / years : null;
}

function formatSignedRate(rate: number | null) {
  if (rate === null) return null;
  return `${rate > 0 ? "+" : ""}${rate.toFixed(1)}`;
}

type InspectionGrid = {
  bounds_lonlat_west_south_east_north: [number, number, number, number];
  width: number;
  height: number;
  dates: string[];
  frames: { date: string; values_cm: (number | null)[][] }[];
};

function lookupGrid(grid: InspectionGrid, lat: number, lon: number) {
  const [west, south, east, north] = grid.bounds_lonlat_west_south_east_north;
  if (lon < west || lon > east || lat < south || lat > north) return null;
  const column = Math.min(grid.width - 1, Math.max(0, Math.round(((lon - west) / (east - west)) * (grid.width - 1))));
  const row = Math.min(grid.height - 1, Math.max(0, Math.round(((north - lat) / (north - south)) * (grid.height - 1))));
  return grid.frames.map((frame) => frame.values_cm[row]?.[column] ?? null);
}

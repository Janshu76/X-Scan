"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ViewModeSelector } from "@/regions/ViewMode";

type Product = { product_id: string; collection: string; processing_level: string; start_time: string; flight_direction: string; polarization: string; beam_mode: string; size_bytes: number | null; browse?: string[] | Record<string, string> | null; metadata?: Record<string, unknown>; download_url?: string; main_file?: string };
type Job = { id: string; job_type: string; status: string; result_json?: string; error_code?: string };

function bytes(value: number | null) {
  if (value == null) return "size unknown";
  if (value < 1024 ** 2) return `${value.toLocaleString()} bytes`;
  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

export default function DataAcquisition() {
  const [region, setRegion] = useState("mexico_city");
  const [collection, setCollection] = useState("opera_disp_s1");
  const [productType, setProductType] = useState("");
  const [polarization, setPolarization] = useState("");
  const [direction, setDirection] = useState("");
  const [beamMode, setBeamMode] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [searchId, setSearchId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const totalBytes = useMemo(() => products.filter((product) => selected.includes(product.product_id)).reduce((sum, product) => sum + (product.size_bytes ?? 0), 0), [products, selected]);

  async function loadHistory() {
    const response = await fetch("/api/jobs?limit=30");
    if (response.ok) setHistory((await response.json() as Job[]).filter((job) => job.job_type === "asf_download"));
  }
  useEffect(() => { fetch("/api/health").then((response) => { setApiReady(response.ok); if (response.ok) loadHistory().catch(() => undefined); }).catch(() => setApiReady(false)); }, []);
  useEffect(() => {
    if (history.every((job) => ["succeeded", "failed", "cancelled"].includes(job.status))) return;
    const timer = window.setInterval(() => loadHistory().catch(() => undefined), 2500);
    return () => window.clearInterval(timer);
  }, [history]);

  async function doSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); setProducts([]); setSelected([]); setSearchId("");
    try {
      const response = await fetch("/api/acquisition/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ region_id: region, collection, start, end, product_type: productType || null, polarization: polarization || null, orbit_direction: direction || null, beam_mode: beamMode || null, max_results: maxResults }) });
      const data = await response.json() as { detail?: string; search_id?: string; count?: number; products?: Product[] };
      if (!response.ok) throw new Error(data.detail ?? "Search failed.");
      setSearchId(data.search_id ?? ""); setProducts(data.products ?? []); setNotice(`Search completed: ${data.count ?? 0} result(s). Nothing has been downloaded.`);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "ASF search failed. No credentials or response details were logged."); }
    finally { setBusy(false); }
  }

  async function queueSelected() {
    if (!searchId || !selected.length) return;
    if (selected.some((id) => products.find((product) => product.product_id === id)?.size_bytes == null)) { setNotice("Cannot queue products without a reported size. Refine the search or inspect ASF metadata."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/acquisition/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ search_id: searchId, region_id: region, product_ids: selected, confirmed: true }) });
      const data = await response.json() as { detail?: string; job_id?: string; total_bytes?: number };
      if (!response.ok) throw new Error(data.detail ?? "Download could not be queued.");
      setNotice(`Explicit selection queued: ${selected.length} product(s), ${bytes(data.total_bytes ?? 0)} total. Worker progress appears below.`);
      await loadHistory();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Download could not be queued."); }
    finally { setBusy(false); }
  }

  return <main className="site-shell space-shell observatory-shell acquisition-shell">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">T</span><span>TERRAWATCH <i>DATA ACQUISITION</i></span></Link><nav><Link href="/">Explore</Link><Link href="/data-library">Data Library</Link><Link className="active" href="/acquisition">Acquisition</Link></nav><ViewModeSelector/></header>
    <section className="acquisition-title"><p className="eyebrow">RESEARCH VIEW · ASF DAAC</p><h1>Search, inspect, select.</h1><p>No result is downloaded automatically. Review metadata and size, then explicitly select products.</p><span className={`status-tag ${apiReady ? "" : "muted"}`}>{apiReady === null ? "CHECKING API" : apiReady ? "API AVAILABLE" : "API OFFLINE · START LOCAL API"}</span></section>
    {notice && <p className="acquisition-notice" role="status">{notice}</p>}
    <form className="acquisition-form" onSubmit={doSearch}>
      <label>Study area<select value={region} onChange={(event) => setRegion(event.target.value)}><option value="mexico_city">Mexico City</option><option value="assam">Assam · draft, not approved</option><option value="antarctica">Pine Island Glacier · draft, not approved</option></select></label>
      <label>Collection<select value={collection} onChange={(event) => { setCollection(event.target.value); setProductType(""); }}><option value="opera_disp_s1">OPERA DISP-S1</option><option value="sentinel1_grd">Sentinel-1 GRD</option><option value="sentinel1_slc">Sentinel-1 SLC</option><option value="nisar">NISAR</option></select></label>
      <label>Product / processing level<input value={productType} onChange={(event) => setProductType(event.target.value)} placeholder={collection === "nisar" ? "e.g. L2_PR_GUNW" : collection === "opera_disp_s1" ? "DISP-S1" : "optional"}/></label>
      <label>Start date<input type="date" required value={start} onChange={(event) => setStart(event.target.value)}/></label>
      <label>End date<input type="date" required value={end} onChange={(event) => setEnd(event.target.value)}/></label>
      <label>Polarization<input value={polarization} onChange={(event) => setPolarization(event.target.value)} placeholder="e.g. VV"/></label>
      <label>Orbit direction<select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">Any</option><option value="ASCENDING">Ascending</option><option value="DESCENDING">Descending</option></select></label>
      <label>Beam mode<input value={beamMode} onChange={(event) => setBeamMode(event.target.value)} placeholder="e.g. IW"/></label>
      <label>Maximum results<input type="number" min="1" max="100" value={maxResults} onChange={(event) => setMaxResults(Math.max(1, Math.min(100, Number(event.target.value))))}/></label>
      <button className="play-button" disabled={busy || !apiReady}>{busy ? "Working…" : "Search ASF"}</button>
    </form>
    <section className="acquisition-results"><div className="card-top"><span className="section-kicker">SEARCH RESULTS</span><span className="status-tag muted">{products.length} SHOWN · NO AUTO DOWNLOAD</span></div>{products.length === 0 && <p className="micro-note">Choose a bounded date window and search. Draft study areas are clearly marked and must be approved before production use.</p>}{products.map((product) => <article className="acquisition-product" key={product.product_id}><label><input type="checkbox" checked={selected.includes(product.product_id)} disabled={busy || product.size_bytes == null || selected.length >= 10 && !selected.includes(product.product_id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, product.product_id] : current.filter((id) => id !== product.product_id))}/><span><b>{product.product_id}</b><small>{product.processing_level} · {product.start_time} · {product.flight_direction} · {product.polarization} · {product.beam_mode}</small></span><strong>{bytes(product.size_bytes)}</strong></label>{product.browse && <details><summary>Browse and QA preview references</summary><pre>{JSON.stringify(product.browse, null, 2)}</pre></details>}</article>)}</section>
    {selected.length > 0 && <section className="download-confirm"><b>Review selected products before download</b><p>{selected.length} selected · total reported size {bytes(totalBytes)}. Main HDF5/NetCDF/archive files only; check each product and license before confirming.</p><button className="play-button" disabled={busy} onClick={queueSelected}>Confirm selected download</button></section>}
    <section className="download-history"><div className="card-top"><span className="section-kicker">DOWNLOAD JOB HISTORY</span><span className="status-tag muted">DATABASE WORKER</span></div>{history.map((job) => <article key={job.id}><b>{job.id}</b><span>{job.status}</span>{job.error_code && <small>{job.error_code}</small>}{job.result_json && <small>{job.result_json}</small>}</article>)}{history.length === 0 && <p className="micro-note">No acquisition jobs recorded on this backend.</p>}</section>
    <section className="acquisition-providers"><span className="section-kicker">PROVIDER ADAPTER STATUS</span><p>ASF is implemented using `asf_search`. Copernicus Data Space (OData/STAC + OAuth2), USGS Landsat (M2M/EarthExplorer), other NASA Earthdata collections (CMR/collection-specific), and NSIDC DAAC (Earthdata/NSIDC APIs) are marked not implemented.</p><p>Downloads require `EARTHDATA_TOKEN` set locally in the backend environment. Credentials never enter browser requests or job payloads. This interface does not start any live request until Search ASF is clicked.</p></section>
    <footer className="site-footer"><Link href="/data-library">← Data Library</Link><span>Only explicitly selected products are queued</span></footer>
  </main>;
}

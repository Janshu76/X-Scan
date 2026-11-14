"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ViewModeSelector } from "@/regions/ViewMode";

type FileRecord = { path: string; status: string; size_bytes?: string | number; appearance?: string; crs?: string; bounds_json?: string; checksum?: string };
type Dataset = { id: string; region_id?: string; region?: string; name: string; provider?: string; product?: string; status?: string; dates_json?: string; dates?: string[] | string; resolution?: string; spatial_resolution?: string; license?: string; processing?: string; files?: FileRecord[]; repository_files?: string[]; originals_location?: string };
type Manifest = Record<string, string>;
type Snapshot = { datasets: Dataset[]; findings: unknown[] };

const regionNames: Record<string, string> = { mexico_city: "Mexico City", assam: "Assam", antarctica: "Antarctica" };
const acceptable = ".tif,.tiff,.geojson,.gpkg,.zip,.nc,.csv";

export default function DataLibrary() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [manifest, setManifest] = useState<Manifest[]>([]);
  const [mode, setMode] = useState<"api" | "static">("static");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [region, setRegion] = useState("mexico_city");
  const [source, setSource] = useState("");
  const [license, setLicense] = useState("");
  const [acquired, setAcquired] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function loadCatalog() {
    const [datasetResponse, manifestResponse] = await Promise.all([
      fetch("/api/datasets"), fetch("/api/manifest"),
    ]);
    if (datasetResponse.ok && manifestResponse.ok) {
      const dbDatasets = await datasetResponse.json() as Dataset[];
      const dbManifest = await manifestResponse.json() as Manifest[];
      if (dbDatasets.length) { setDatasets(dbDatasets); setManifest(dbManifest); setMode("api"); return; }
    }
    const snapshotResponse = await fetch("/data/terrawatch/phase1-snapshot.json");
    if (!snapshotResponse.ok) throw new Error("Catalog data is unavailable. Run the seed command in README.md.");
    const snapshot = await snapshotResponse.json() as Snapshot;
    setDatasets(snapshot.datasets); setManifest([]); setMode("static");
  }

  useEffect(() => { loadCatalog().catch((reason: Error) => setMessage(reason.message)); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setMessage("Choose a file to register."); return; }
    const suffix = `.${file.name.split(".").at(-1)}`.toLowerCase();
    if (!acceptable.split(",").includes(suffix)) { setMessage("Supported formats: GeoTIFF, GeoJSON, GeoPackage, shapefile ZIP, NetCDF and CSV."); return; }
    if (!source.trim() || !license.trim() || !acquired) { setMessage("Source, license and acquisition/publication date are required."); return; }
    setBusy(true); setMessage("");
    try {
      const body = new FormData();
      body.set("region_id", region); body.set("source", source); body.set("license_name", license); body.set("acquired", acquired); body.set("file", file);
      const response = await fetch("/api/data/register", { method: "POST", body });
      const result = await response.json() as { detail?: string; path?: string; size_bytes?: number; checksum_sha256?: string; crs?: string; bounds?: number[] };
      if (!response.ok) throw new Error(result.detail ?? "Registration failed.");
      setMessage(`Registered ${result.path} · ${result.size_bytes} bytes · SHA-256 ${result.checksum_sha256} · CRS ${result.crs ?? "unknown"}.`);
      setFile(null); setSource(""); setLicense(""); setAcquired("");
      await loadCatalog();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Registration failed."); }
    finally { setBusy(false); }
  }

  return <main className="site-shell space-shell observatory-shell data-library-shell">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">T</span><span>TERRAWATCH <i>DATA LIBRARY</i></span></Link><nav><Link href="/">Explore</Link><Link className="active" href="/data-library">Data Library</Link><Link href="/data-methods">Methods</Link></nav><ViewModeSelector/></header>
    <section className="library-title"><p className="eyebrow">RESEARCH VIEW · CATALOG &amp; MANIFEST</p><h1>Data Library</h1><p>Registered datasets, local files, provenance, availability and where each item appears. Missing originals are never represented as downloaded.</p><span className="status-tag">SOURCE: {mode === "api" ? "DATABASE" : "STATIC CATALOG SNAPSHOT"}</span></section>
    {message && <p className="library-message" role="status">{message}</p>}
    <section className="library-list">{datasets.map((dataset) => {
      const files: FileRecord[] = dataset.files ?? (dataset.repository_files ?? []).map((path) => ({ path, status: "catalogued", appearance: path.includes("subsidence") ? "Mexico Time Machine" : "Context / provenance" }));
      const dates = Array.isArray(dataset.dates) ? dataset.dates.join(" — ") : dataset.dates ?? dataset.dates_json ?? "unknown";
      return <article className="library-dataset" key={dataset.id}><header><div><span className={`status-tag ${dataset.status === "not-added" || dataset.status === "external" ? "muted" : ""}`}>{(dataset.status ?? "catalogued").toUpperCase()}</span><h2>{dataset.name}</h2></div><span>{regionNames[dataset.region_id ?? dataset.region ?? ""] ?? dataset.region_id ?? dataset.region ?? "unknown"}</span></header><div className="library-metadata"><div><small>Provider</small><b>{dataset.provider ?? "unknown"}</b></div><div><small>Product</small><b>{dataset.product ?? "unknown"}</b></div><div><small>Dates</small><b>{dates}</b></div><div><small>Resolution</small><b>{dataset.resolution ?? dataset.spatial_resolution ?? "unknown"}</b></div><div><small>License</small><b>{dataset.license ?? "unknown"}</b></div><div><small>Processing</small><b>{dataset.processing ?? "unknown"}</b></div></div><ul className="library-files">{files.map((entry) => <li key={entry.path}><span className={entry.status === "missing" || entry.status === "external" ? "evidence-unavailable" : "evidence-public"}>{(entry.status ?? "catalogued").toUpperCase()}</span><code>{entry.path}</code><span>{entry.size_bytes == null ? "size unknown" : `${Number(entry.size_bytes).toLocaleString()} bytes`}</span><small>{entry.appearance ?? "Catalog"}</small></li>)}</ul>{dataset.originals_location && <p className="micro-note">Originals location: {dataset.originals_location}</p>}</article>;
    })}</section>
    {manifest.length > 0 && <section className="manifest-table"><h2>Imported manifest records</h2>{manifest.map((entry, index) => <p key={`${entry.file_path}-${index}`}><b>{entry.dataset_name}</b> · {entry.source} · {entry.acquisition_date} · {entry.resolution} · {entry.license} · {entry.file_path}</p>)}</section>}
    <section className="register-card"><div className="card-top"><span className="section-kicker">MANUAL FILE REGISTRATION</span><span className="status-tag muted">ORIGINAL BYTES PRESERVED</span></div><p>Upload a file with its source, license and date. The original is stored unchanged in ignored `data/raw/&lt;region&gt;/`; metadata and checksum are recorded in the manifest.</p><form className="register-form" onSubmit={submit}><label>Region<select value={region} onChange={(event) => setRegion(event.target.value)}><option value="mexico_city">Mexico City</option><option value="assam">Assam</option><option value="antarctica">Antarctica</option></select></label><label>Source<input required value={source} onChange={(event) => setSource(event.target.value)} placeholder="Provider or organization"/></label><label>License<input required value={license} onChange={(event) => setLicense(event.target.value)} placeholder="License name or terms"/></label><label>Acquisition or publication date<input required type="date" value={acquired} onChange={(event) => setAcquired(event.target.value)}/></label><label>File<input required type="file" accept={acceptable} onChange={(event) => setFile(event.target.files?.[0] ?? null)}/><small>GeoTIFF · GeoJSON · GeoPackage · shapefile ZIP · NetCDF · CSV</small></label><button className="play-button" disabled={busy}>{busy ? "Registering…" : "Register file"}</button></form><p className="micro-note">CRS and bounds are extracted where supported. File size is streamed and SHA-256 checked. Duplicate content is rejected. All source fields remain user supplied.</p></section>
    <footer className="site-footer"><Link href="/">← Observatory</Link><span>Catalog and local registration only · no automatic downloads</span></footer>
  </main>;
}

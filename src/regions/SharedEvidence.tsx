"use client";

import { useEffect, useState } from "react";

type Dataset = { id: string; name: string; provider: string; product: string; status?: string; license?: string; repository_files?: string[] };
type Finding = { id: string; region_id: string; evidence_label: string; public_statement: string; research_statement: string; dataset_ids: string[]; processing_run_ids: string[]; limitations: string[]; uncertainty: string };
type Snapshot = { datasets: Dataset[]; findings: Finding[] };

async function fetchList<T>(endpoint: string): Promise<T[]> {
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) return [];
    const result = await response.json() as T[];
    return Array.isArray(result) ? result : [];
  } catch { return []; }
}

export default function SharedEvidence({ regionId, view, compact = false }: { regionId: string; view: "public" | "research"; compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([fetchList<Finding>(`/api/findings?region_id=${encodeURIComponent(regionId)}`), fetchList<Dataset>(`/api/datasets?region_id=${encodeURIComponent(regionId)}`)])
      .then(async ([findings, datasets]) => {
        if (findings.length && datasets.length) return { findings, datasets };
        const response = await fetch("/data/terrawatch/phase1-snapshot.json");
        if (!response.ok) throw new Error("Shared catalog snapshot is not available.");
        return await response.json() as Snapshot;
      }).then((result) => { if (active) setSnapshot(result); }).catch(() => { if (active) setSnapshot({ findings: [], datasets: [] }); });
    return () => { active = false; };
  }, [regionId]);

  const findings = snapshot?.findings.filter((finding) => finding.region_id === regionId) ?? [];
  const datasets = snapshot?.datasets.filter((dataset) => (dataset as Dataset & { region?: string }).region === regionId) ?? [];
  return <section className={`shared-evidence ${compact ? "shared-evidence-compact" : ""}`}>
    <div className="card-top"><span className="section-kicker">{view === "public" ? "EVIDENCE SUMMARY" : "SHARED FINDINGS & DATASETS"}</span><span className="status-tag muted">{view === "public" ? "SAME REGISTERED EVIDENCE" : "STATIC OR API SOURCE"}</span></div>
    {!snapshot && <p className="micro-note">Loading shared findings…</p>}
    {snapshot && findings.length === 0 && <p className="micro-note">No findings are registered for this region.</p>}
    <div className="shared-finding-list">{findings.map((finding) => {
      const cited = datasets.filter((dataset) => finding.dataset_ids.includes(dataset.id));
      return <article className="shared-finding" key={finding.id}><span className={`evidence-label evidence-${finding.evidence_label.toLowerCase().replaceAll(" ", "-")}`}>{finding.evidence_label}</span><p>{view === "public" ? finding.public_statement : finding.research_statement}</p>{view === "research" && <><small>Evidence: {cited.length ? cited.map((dataset) => dataset.name).join("; ") : "No project dataset cited"}</small><small>Processing runs: {finding.processing_run_ids.length ? finding.processing_run_ids.join(", ") : "none"}</small><small>Limitations: {finding.limitations.join("; ")}</small><small>Uncertainty: {finding.uncertainty}</small></>}</article>;
    })}</div>
    {view === "research" && datasets.length > 0 && <details className="shared-dataset-list"><summary>{datasets.length} registered datasets and sources</summary>{datasets.map((dataset) => <p key={dataset.id}><b>{dataset.name}</b> · {dataset.provider} · {dataset.product} · {dataset.status ?? "downloaded"}{dataset.license ? ` · ${dataset.license}` : ""}</p>)}</details>}
  </section>;
}

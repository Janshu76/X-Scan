"use client";

import { reportMarkdown } from "@/regions/mexico_city/analysis";
import type { CatalogEntry } from "@/regions/mexico_city/analysis";
import type { MexicoSeries } from "@/regions/model";
import { publishedContext } from "@/regions/mexico_city/publishedContext";

export default function ReportActions({ series, catalog }: { series: MexicoSeries; catalog: CatalogEntry[] }) {
  const download = () => {
    const markdown = reportMarkdown(series, catalog, publishedContext);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `terrawatch-${series.area.toLowerCase().replaceAll(" ", "-")}-investigation.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <div className="report-actions">
    <button className="play-button" onClick={download}>Download investigation report</button>
    <a className="quiet-button report-print-link" href="/investigation-report" target="_blank" rel="noreferrer">Open print-friendly report</a>
    <span>Markdown export and browser print view · computed locally</span>
  </div>;
}

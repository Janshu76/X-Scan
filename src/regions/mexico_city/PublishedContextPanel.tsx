"use client";

import { publishedContext, publishedContextClosing } from "@/regions/mexico_city/publishedContext";

export default function PublishedContextPanel() {
  return <details className="card literature-panel">
    <summary><span className="section-kicker">PUBLISHED CONTEXT · LITERATURE, NOT DATA HELD BY THIS PROJECT</span><span aria-hidden="true">＋</span></summary>
    <div className="literature-list">{publishedContext.map((entry) => <article className="literature-entry" key={entry.id}>
      <span className="literature-period">{entry.period}</span><h3>{entry.title}</h3><p>{entry.detail}</p><a href={entry.href} target="_blank" rel="noreferrer">Open publication ↗</a>
    </article>)}</div>
    <p className="literature-closing">{publishedContextClosing}</p>
  </details>;
}

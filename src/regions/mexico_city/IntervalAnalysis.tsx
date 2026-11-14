"use client";

import { buildIntervals, signed } from "@/regions/mexico_city/analysis";
import type { MexicoSeries } from "@/regions/model";

export default function IntervalAnalysis({ series, selectedDateIndex, onSelectInterval }: {
  series: MexicoSeries;
  selectedDateIndex: number;
  onSelectInterval: (dateIndex: number) => void;
}) {
  const intervals = buildIntervals(series);
  if (!intervals.length) return <section className="card interval-card"><h3>Interval changes</h3><p>Interval values are not available until matching dates and series values load.</p></section>;
  const selectedInterval = Math.min(Math.max(selectedDateIndex === 0 ? 0 : selectedDateIndex - 1, 0), intervals.length - 1);
  const limit = Math.max(1, ...intervals.flatMap((item) => [Math.abs(item.fastestChangeCm), Math.abs(item.medianChangeCm)]));
  const width = Math.max(600, intervals.length * 84);
  const height = 220;
  const zeroY = 91;
  const halfRange = 65;
  const groupWidth = width / intervals.length;
  const barWidth = Math.min(18, groupWidth * 0.24);
  const yFor = (value: number) => zeroY - (value / limit) * halfRange;

  return <section className="card interval-card" aria-labelledby="interval-title">
    <div className="card-top"><span className="section-kicker">INTERVAL VIEW</span><span className="status-tag muted">OBSERVATION</span></div>
    <h3 id="interval-title">Change between each acquisition</h3>
    <p className="interval-intro">Each bar shows change in cumulative LOS displacement for one date interval; the companion figure shows its annualised rate.</p>
    <div className="interval-legend"><span><i className="interval-fastest-key"/>Fastest-subsiding 1% · cm</span><span><i className="interval-median-key"/>Whole-scene median · cm</span></div>
    <div className="interval-chart-scroll"><svg className="interval-chart" role="img" aria-label={`Interval change chart with ${intervals.length} date intervals`} viewBox={`0 0 ${width} ${height}`}>
      <line x1="0" x2={width} y1={zeroY} y2={zeroY} className="interval-zero-line"/>
      {intervals.map((item, index) => {
        const center = groupWidth * (index + 0.5);
        const selected = index === selectedInterval;
        const fastY = yFor(item.fastestChangeCm);
        const medianY = yFor(item.medianChangeCm);
        return <g key={`${item.from}-${item.to}`} className={`interval-group ${selected ? "selected" : ""}`} role="button" tabIndex={0} aria-label={`${item.label}: fastest-zone ${signed(item.fastestChangeCm)} centimetres, scene median ${signed(item.medianChangeCm)} centimetres`} onClick={() => onSelectInterval(item.index + 1)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectInterval(item.index + 1); } }}>
          {selected && <rect x={center - groupWidth * 0.44} y="7" width={groupWidth * 0.88} height={height - 17} rx="5" className="interval-selected-bg"/>}
          <rect x={center - barWidth - 2} y={Math.min(zeroY, fastY)} width={barWidth} height={Math.max(1, Math.abs(fastY - zeroY))} rx="2" className="interval-fastest-bar"/>
          <rect x={center + 2} y={Math.min(zeroY, medianY)} width={barWidth} height={Math.max(1, Math.abs(medianY - zeroY))} rx="2" className="interval-median-bar"/>
          <text x={center} y="190" textAnchor="middle" className="interval-label">{item.label.split("–")[0]}</text>
          <text x={center} y="204" textAnchor="middle" className="interval-label">{item.label.split("–")[1]}</text>
          <title>{`${item.label} · fastest-zone ${signed(item.fastestChangeCm)} cm (${signed(item.fastestRateCmPerYear)} cm/yr) · scene median ${signed(item.medianChangeCm)} cm (${signed(item.medianRateCmPerYear)} cm/yr)`}</title>
        </g>;
      })}
    </svg></div>
    <div className="interval-selected-values">Selected: <b>{intervals[selectedInterval].label}</b><span>Fastest-zone change {signed(intervals[selectedInterval].fastestChangeCm)} cm · annualised rate {signed(intervals[selectedInterval].fastestRateCmPerYear)} cm/yr</span><span>Scene median change {signed(intervals[selectedInterval].medianChangeCm)} cm · annualised rate {signed(intervals[selectedInterval].medianRateCmPerYear)} cm/yr</span></div>
    <p className="interval-reading-note">Intervals are about six months; seasonal effects such as rainy and dry periods may influence individual intervals; this has not been tested here.</p>
  </section>;
}

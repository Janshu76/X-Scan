import type { MexicoSeries } from "@/regions/model";
import { formatDate, formatMonthYear } from "@/regions/model";

export type CatalogEntry = {
  id: string;
  name: string;
  provider?: string;
  product?: string;
  dates?: string | string[] | null;
  spatial_resolution?: string | number | null;
  license?: string;
  repository_files?: string[];
  processing?: string;
  status?: string;
};

export type IntervalRecord = {
  index: number;
  from: string;
  to: string;
  label: string;
  elapsedYears: number;
  fastestChangeCm: number;
  fastestRateCmPerYear: number;
  medianChangeCm: number;
  medianRateCmPerYear: number;
};

export type ConfidenceItem = { title: string; level: string; reason: string };

export function timestamp(date: string) {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
}

export function elapsedYears(start: string, end: string) {
  return (timestamp(end) - timestamp(start)) / (365.25 * 24 * 60 * 60 * 1000);
}

export function signed(value: number, digits = 1) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
}

export function buildIntervals(series: MexicoSeries): IntervalRecord[] {
  const count = Math.min(series.dates.length, series.series_fastest_1pct_cm.length, series.series_scene_median_cm.length);
  const intervals: IntervalRecord[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const years = elapsedYears(series.dates[index], series.dates[index + 1]);
    if (!(years > 0)) continue;
    const fastestChangeCm = series.series_fastest_1pct_cm[index + 1] - series.series_fastest_1pct_cm[index];
    const medianChangeCm = series.series_scene_median_cm[index + 1] - series.series_scene_median_cm[index];
    intervals.push({
      index,
      from: series.dates[index],
      to: series.dates[index + 1],
      label: `${formatMonthYear(series.dates[index])}–${formatMonthYear(series.dates[index + 1])}`,
      elapsedYears: years,
      fastestChangeCm,
      fastestRateCmPerYear: fastestChangeCm / years,
      medianChangeCm,
      medianRateCmPerYear: medianChangeCm / years,
    });
  }
  return intervals;
}

export function wholeSceneMedianRate(series: MexicoSeries) {
  const values = series.series_scene_median_cm;
  const dates = series.dates;
  if (values.length < 2 || dates.length < 2) return null;
  const years = elapsedYears(dates[0], dates.at(-1)!);
  return years > 0 ? (values.at(-1)! - values[0]) / years : null;
}

export function catalogHasData(entries: CatalogEntry[], keys: string[]) {
  return entries.some((entry) => {
    const haystack = `${entry.id} ${entry.name}`.toLowerCase();
    const relevant = keys.some((key) => haystack.includes(key.toLowerCase()));
    const hasFiles = Boolean(entry.repository_files?.length);
    return relevant && (hasFiles || entry.status === "available");
  });
}

export function buildConfidence(series: MexicoSeries, entries: CatalogEntry[]): ConfidenceItem[] {
  const intervals = buildIntervals(series);
  const decreases = intervals.filter((interval) => interval.fastestChangeCm < 0).length;
  const patternLevel = decreases >= Math.max(0, intervals.length - 1) ? "High" : decreases >= 6 ? "Medium" : "Low";
  const coverage = series.valid_pixel_fraction;
  const coverageLevel = coverage >= 0.7 ? "High" : coverage >= 0.5 ? "Medium" : "Low";
  const medianRate = wholeSceneMedianRate(series);
  const groundwater = catalogHasData(entries, ["groundwater", "aquifer", "well"]);
  const geotechnical = catalogHasData(entries, ["geotechnical", "lake-zone", "lake zone"]);
  const attributionReason = groundwater || geotechnical
    ? `Catalog data present: ${[groundwater && "groundwater", geotechnical && "geotechnical"].filter(Boolean).join(" and ")}; this supports partial checking only.`
    : "Groundwater, pumping, and geotechnical data are not loaded; contributing causes cannot be tested.";
  return [
    { title: "Pattern consistency", level: patternLevel, reason: `The fastest-zone series decreases in ${decreases} of ${intervals.length} intervals.` },
    { title: "Coverage", level: coverageLevel, reason: `${(coverage * 100).toFixed(1)}% of pixels are valid in every block.` },
    { title: "Absolute rate", level: "Limited", reason: `The LOS series is relative to a reference point.${medianRate !== null && Math.abs(medianRate) > 1 ? " A non-zero scene median suggests reference-point or atmospheric offsets." : ""}` },
    { title: "Cause attribution", level: groundwater || geotechnical ? "Partially testable" : "Not tested", reason: attributionReason },
  ];
}

export type InvestigationNextStep = { title: string; availability: "available in this app" | "not yet added"; reason: string };

export function recommendedInvestigations(entries: CatalogEntry[]): InvestigationNextStep[] {
  const recommendations: { title: string; keys: string[]; reason: string }[] = [
    { title: "Groundwater levels and well data", keys: ["groundwater", "well"], reason: "Needed to test pumping and water-level hypotheses." },
    { title: "Geotechnical lake-zone maps", keys: ["geotechnical", "lake-zone", "lake zone"], reason: "Needed to compare the observed pattern with sediment and soil units." },
    { title: "GNSS comparison", keys: ["gnss", "gps station"], reason: "Would add independent vertical measurements; these differ from InSAR LOS." },
    { title: "Stable-area re-referencing", keys: ["stable-area reference", "re-reference"], reason: "Would help test sensitivity to the selected reference point." },
    { title: "Longer time series", keys: ["extended time series", "longer series"], reason: "Would extend the observed period for trend and interval context." },
    { title: "NISAR comparison, if coverage exists", keys: ["nisar"], reason: "Would be a separate sensor comparison; current displacement comes from Sentinel-1." },
  ];
  return recommendations.map((item) => ({
    title: item.title,
    availability: catalogHasData(entries, item.keys) ? "available in this app" : "not yet added",
    reason: item.reason,
  }));
}

export function limitations(series: MexicoSeries) {
  const years = series.dates.length > 1 ? elapsedYears(series.dates[0], series.dates.at(-1)!) : 0;
  const spanText = years < 1 ? `${Math.max(0, Math.round(years * 12))} months` : `about ${years.toFixed(1)} years`;
  return [
    "InSAR measures line-of-sight displacement, not vertical motion.",
    "Values are relative to a reference point, not an absolute motion frame.",
    "Atmospheric delay may contribute to the western mountain signal.",
    "Masked pixels (including water and forest) have no reliable values.",
    "Reference blocks are chained by summation, so small reference drift may remain.",
    "This displayed displacement is Sentinel-1 OPERA DISP-S1, not NISAR.",
    `The observation period is ${spanText}; this is a short record for seasonal interpretation.`,
  ];
}

export function reportMarkdown(series: MexicoSeries, entries: CatalogEntry[], references: { title: string; detail: string; href: string }[]) {
  const intervals = buildIntervals(series);
  const confidence = buildConfidence(series, entries);
  const next = recommendedInvestigations(entries);
  const rate = wholeSceneMedianRate(series);
  const sourceRows = entries.map((entry) => `| ${entry.name} | ${entry.provider ?? "Not recorded"} | ${Array.isArray(entry.dates) ? `${formatDate(entry.dates[0])}–${formatDate(entry.dates.at(-1)!)}` : entry.dates ?? "Not applicable / not recorded"} | ${entry.spatial_resolution ?? "Not recorded"} | ${entry.license ?? "Not recorded"} |`).join("\n");
  const intervalRows = intervals.map((item) => `| ${item.label} | ${signed(item.fastestChangeCm)} | ${signed(item.fastestRateCmPerYear)} | ${signed(item.medianChangeCm)} | ${signed(item.medianRateCmPerYear)} |`).join("\n");
  const confidenceRows = confidence.map((item) => `- **${item.title}: ${item.level}.** ${item.reason}`).join("\n");
  const nextRows = next.map((item) => `- **${item.title}** — ${item.availability}. ${item.reason}`).join("\n");
  const referenceRows = references.map((item) => `- ${item.title}. ${item.detail} [Source](${item.href})`).join("\n");
  const total = series.series_fastest_1pct_cm.at(-1) ?? 0;
  return `# TerraWatch investigation report — ${series.area}\n\nGenerated: ${new Date().toLocaleString()}\n\n## Data sources\n\n| Dataset | Source | Dates | Resolution | Licence |\n|---|---|---|---|---|\n${sourceRows}\n\n## Observed values\n\n- Product: ${series.product}.\n- Observation period: ${formatDate(series.dates[0])} to ${formatDate(series.dates.at(-1)!)}.\n- Fastest-zone mean cumulative change: ${signed(total)} cm LOS.\n- Annualised fastest-one-percent mean rate: ${signed(series.mean_rate_cm_per_year_fastest_1pct)} cm/year LOS. This is relative to a reference point, not an exact absolute rate.\n- Whole-scene median annualised endpoint rate: ${rate === null ? "not available" : `${signed(rate)} cm/year LOS`}. A positive median is not interpreted as the city rising.\n- Valid pixel fraction: ${(series.valid_pixel_fraction * 100).toFixed(1)}%.\n\n## Interval table\n\n| Interval | Fastest-zone change (cm) | Fastest-zone rate (cm/yr) | Scene median change (cm) | Scene median rate (cm/yr) |\n|---|---:|---:|---:|---:|\n${intervalRows}\n\n## Confidence indicators\n\n${confidenceRows}\n\n## Data limitations\n\n${limitations(series).map((item) => `- ${item}`).join("\n")}\n\n## Possible explanations (hypotheses, not tested)\n\nMexico City overlies compressible lake-bed clays. Published literature discusses groundwater extraction, urban loading, and local geology as possible contributors. This project has no groundwater levels, pumping records, or geotechnical maps, so it cannot test those explanations. Atmospheric delay, reference-point effects, unwrapping errors, processing artefacts, and seasonal effects may also influence the signal.\n\n## Recommended next steps\n\n${nextRows}\n\n## Published context (literature, not data held by this project)\n\n${referenceRows}\n\nThis project's observations (${formatDate(series.dates[0])} to ${formatDate(series.dates.at(-1)!)}) are a different statistic over a different period and are not directly comparable to these figures.\n\n## Caveat\n\n${series.caveat} LOS is not vertical motion. Negative values mean motion away from the satellite. The blue/positive western signal is not interpreted as uplift.\n`;
}

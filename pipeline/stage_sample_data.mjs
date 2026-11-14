import { copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pack = path.join(root, "data", "mexico_city", "subsidence_adjusted");
const output = path.join(root, "public", "data", "regions", "mexico_city");
const contextSource = path.join(root, "data", "mexico_city", "context");
const nisarSource = path.join(root, "data", "mexico_city", "nisar");
await Promise.all([mkdir(output, { recursive: true }), mkdir(path.join(output, "context"), { recursive: true }), mkdir(path.join(output, "nisar"), { recursive: true })]);

const summary = JSON.parse(await readFile(path.join(pack, "summary.json"), "utf8"));
const csv = (await readFile(path.join(pack, "timeseries_points.csv"), "utf8")).trim().split(/\r?\n/);
const columns = csv[0].split(",");
const dateColumns = columns.map((name, index) => ({ name, index })).filter(({ name }) => name.startsWith("cum_") );
const records = csv.slice(1).map((line) => {
  const cells = line.split(",");
  return {
    lon: Number(cells[1]), lat: Number(cells[2]), velocity: Number(cells[3]),
    cumulative: dateColumns.map(({ index }) => Number(cells[index])),
  };
}).filter((point) => Number.isFinite(point.velocity) && point.cumulative.every(Number.isFinite));
if (!records.length || !dateColumns.length) throw new Error("Adjusted sample pack has no valid time-series points or dates.");

const selectedCount = Math.max(1, Math.ceil(records.length * 0.01));
const mostSubsiding = [...records].sort((a, b) => a.velocity - b.velocity).slice(0, selectedCount);
const mostNegativeCumulative = [...records].sort((a, b) => a.cumulative.at(-1) - b.cumulative.at(-1))[0];
const sceneMedian = dateColumns.map(({ index }) => {
  const values = records.map((point) => point.cumulative[dateColumns.findIndex((column) => column.index === index)]).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
});
const overlayBounds = JSON.parse(await readFile(path.join(pack, "overlay_bounds.json"), "utf8"));
const corners = overlayBounds["overlay_cumulative_*.png"].corners_lonlat_TL_TR_BR_BL;
const bounds = [Math.min(...corners.map((corner) => corner[0])), Math.min(...corners.map((corner) => corner[1])), Math.max(...corners.map((corner) => corner[0])), Math.max(...corners.map((corner) => corner[1]))];
const dates = dateColumns.map(({ name }) => name.slice("cum_".length).replaceAll("-", ""));
const series = {
  area: "Mexico City",
  product: summary.source,
  units: "centimetres line-of-sight displacement relative to estimated stable ground",
  caveat: "Stable-ground adjustment assumes most of the scene is stable and that a uniform offset applies everywhere. This is not proven. LOS is not vertical movement; atmospheric delay is not fully corrected, and chained blocks can accumulate errors.",
  dates,
  bounds_lonlat_west_south_east_north: bounds,
  color_range_cm: [-summary.colour_limits.cumulative_cm, summary.colour_limits.cumulative_cm],
  valid_pixel_fraction: summary.pixels_valid_in_all_blocks_percent / 100,
  series_fastest_1pct_cm: dateColumns.map((_, index) => mostSubsiding.reduce((sum, point) => sum + point.cumulative[index], 0) / mostSubsiding.length),
  series_scene_median_cm: sceneMedian,
  mean_rate_cm_per_year_fastest_1pct: mostSubsiding.reduce((sum, point) => sum + point.velocity, 0) / mostSubsiding.length,
  fastest_pixel_lonlat: [mostSubsiding[0].lon, mostSubsiding[0].lat],
  fastest_pixel_final_cm: mostNegativeCumulative.cumulative.at(-1),
  adjustment: summary.stable_ground_adjustment,
  approximate_sample_points: records.length,
};
await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(output, "series.json"), `${JSON.stringify(series, null, 2)}\n`));
await copyFile(path.join(pack, "summary.json"), path.join(output, "pack_summary.json"));

const files = await readdir(pack);
for (const file of files) {
  if (/^overlay_cumulative_\d{8}\.png$/.test(file)) {
    const date = file.slice("overlay_cumulative_".length, -4).replaceAll("-", "");
    await copyFile(path.join(pack, file), path.join(output, `overlay_${date}.png`));
  }
}
await copyFile(path.join(root, "data", "mexico_city", "aoi.geojson"), path.join(output, "aoi.geojson"));
const contextFiles = ["gnss.json", "gnss_vs_insar_v2.json", "gnss_vs_insar_v3.json", "hillshade_overlay.png", "dem_info.json", "manifest.csv"];
for (const file of contextFiles) {
  try { await copyFile(path.join(contextSource, file), path.join(output, "context", file)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
for (const file of ["granules_summary.json", "pair2_preview.png", "aoi_crop_pair2.png"]) {
  try { await copyFile(path.join(nisarSource, file), path.join(output, "nisar", file)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
console.log(`Staged adjusted Mexico City sample data (${dates.length} dates, ${records.length} approximate points) into ${path.relative(root, output)}`);

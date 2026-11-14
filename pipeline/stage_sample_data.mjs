import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "data", "samples", "mexico_city");
const output = path.join(root, "public", "data", "regions", "mexico_city");
await mkdir(output, { recursive: true });
for (const file of await readdir(source)) {
  if (!(file === "series.json" || file === "inspection_grid.json" || /^overlay_\d{8}\.png$/.test(file))) continue;
  await copyFile(path.join(source, file), path.join(output, file));
}
await copyFile(path.join(root, "data", "mexico_city", "aoi.geojson"), path.join(output, "aoi.geojson"));
console.log(`Staged Mexico City sample data into ${path.relative(root, output)}`);

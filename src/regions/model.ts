export type RegionId = "mexico_city";

export type DatasetLayer = {
  id: string;
  title: string;
  status: "available" | "not-added";
  reason?: string;
  source?: string;
  attribution?: string;
};

export type MexicoSeries = {
  area: string;
  product: string;
  units: string;
  caveat: string;
  dates: string[];
  bounds_lonlat_west_south_east_north: [number, number, number, number];
  color_range_cm: [number, number];
  valid_pixel_fraction: number;
  series_fastest_1pct_cm: number[];
  series_most_sinking_5pct_cm: number[];
  series_scene_median_cm: number[];
  mean_rate_cm_per_year_fastest_1pct: number;
  fastest_pixel_lonlat: [number, number];
  fastest_pixel_final_cm: number;
  crs?: string;
  blocks?: { start: string; end: string; reference_shift_removed_cm: number }[];
  quality_notes?: string[];
};

export const mexicoLayers: DatasetLayer[] = [
  { id: "displacement", title: "Sentinel-1 displacement", status: "available", source: "NASA ASF DAAC · OPERA L3 DISP-S1" },
  { id: "aoi", title: "Study area", status: "available", source: "TerraWatch study extent" },
  { id: "terrain", title: "Terrain & hillshade", status: "available", source: "Copernicus DEM GLO-30 · hillshade context preview" },
  { id: "roads", title: "Roads & facilities", status: "not-added", reason: "OSM exports are not present." },
  { id: "gnss", title: "GNSS stations", status: "available", source: "Nevada Geodetic Laboratory · context only" },
  { id: "buildings", title: "Buildings", status: "not-added", reason: "Building layer has not been produced." },
  { id: "aquifer", title: "Aquifer boundary", status: "not-added", reason: "No boundary file has been added." },
];

export function formatDate(yyyymmdd: string) {
  return new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T12:00:00Z`)
    .toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatMonthYear(yyyymmdd: string) {
  return new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T12:00:00Z`)
    .toLocaleDateString("en", { year: "2-digit", month: "short", timeZone: "UTC" });
}

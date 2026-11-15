import type { StyleSpecification } from "maplibre-gl";

/** One shared, muted OSM basemap style for every TerraWatch map. */
export function createTerraWatchMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{
      id: "terrawatch-osm-base",
      type: "raster",
      source: "osm",
      paint: {
        "raster-saturation": -0.82,
        "raster-contrast": 0.12,
        "raster-brightness-min": 0.04,
        "raster-brightness-max": 0.62,
      },
    }],
  };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

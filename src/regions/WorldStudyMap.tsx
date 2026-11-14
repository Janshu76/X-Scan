"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as MapLibreMap } from "maplibre-gl";

const features = {
  type: "FeatureCollection" as const,
  features: [
    { type: "Feature" as const, properties: { id: "mexico-city", label: "Mexico City", status: "DATA AVAILABLE" }, geometry: { type: "Point" as const, coordinates: [-99.1344, 19.4706] } },
    { type: "Feature" as const, properties: { id: "assam", label: "Majuli–Jorhat · draft", status: "DRAFT · NOT APPROVED" }, geometry: { type: "Point" as const, coordinates: [94.17, 26.95] } },
    { type: "Feature" as const, properties: { id: "antarctica", label: "Pine Island Glacier · draft", status: "DRAFT · NOT APPROVED" }, geometry: { type: "Point" as const, coordinates: [-100, -75.16667] } },
  ],
};

const style = { version: 8 as const, sources: { osm: { type: "raster" as const, tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster" as const, source: "osm" }] };

export default function WorldStudyMap() {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!container.current) return;
    let map: MapLibreMap | null = null;
    let canceled = false;
    import("maplibre-gl").then(({ Map, NavigationControl }) => {
      if (canceled || !container.current) return;
      map = new Map({ container: container.current, style, center: [0, 15], zoom: 0.35, minZoom: 0.2, maxZoom: 7, attributionControl: { compact: true } });
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map?.addSource("study-areas", { type: "geojson", data: features });
        map?.addLayer({ id: "study-area-points", type: "circle", source: "study-areas", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 4, 5, 9], "circle-color": ["match", ["get", "id"], "mexico-city", "#edb372", "#72c9d4"], "circle-stroke-color": "#f2e9d8", "circle-stroke-width": 1.5 } });
        map?.addLayer({ id: "study-area-labels", type: "symbol", source: "study-areas", layout: { "text-field": ["get", "label"], "text-offset": [0, 1.25], "text-size": 11, "text-allow-overlap": true }, paint: { "text-color": "#f2eadc", "text-halo-color": "#0b1120", "text-halo-width": 1.5 } });
        map?.on("click", "study-area-points", (event) => {
          const feature = event.features?.[0];
          const id = feature?.properties?.id;
          if (id === "mexico-city" || id === "assam" || id === "antarctica") router.push(`/regions/${id}`);
        });
        map?.on("mouseenter", "study-area-points", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
        map?.on("mouseleave", "study-area-points", () => { if (map) map.getCanvas().style.cursor = ""; });
      });
      map.on("error", () => setMessage("Live basemap tiles are unavailable. Region links remain available below."));
    }).catch(() => setMessage("The interactive map could not be initialized. Region links remain available below."));
    return () => { canceled = true; map?.remove(); };
  }, [router]);

  return <div className="world-map-wrap"><div className="world-map" ref={container} aria-label="Interactive map of TerraWatch study-area locations"/><div className="map-overline"><b>STUDY AREAS</b><span>Markers open their region page</span></div>{message && <p className="world-map-message">{message}</p>}</div>;
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import { createTerraWatchMapStyle, prefersReducedMotion } from "@/regions/maps/mapStyle";

const velocityUrl = "/data/regions/mexico_city/overlay_velocity.png";
const boundsUrl = "/data/regions/mexico_city/overlay_bounds.json";
const aoiUrl = "/data/regions/mexico_city/aoi.geojson";

export default function WorldStudyMap() {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [mexicoSelected, setMexicoSelected] = useState(false);
  const [velocityLimit, setVelocityLimit] = useState<number | null>(null);
  const showMexicoOverlay = useRef(false);

  useEffect(() => {
    if (!container.current) return;
    let map: MapLibreMap | null = null;
    let canceled = false;
    const markers: MapLibreMarker[] = [];
    import("maplibre-gl").then(({ Map, Marker, Popup }) => {
      if (canceled || !container.current) return;
      map = new Map({ container: container.current, style: createTerraWatchMapStyle(), center: [0, 17], zoom: 0.3, minZoom: 0.2, maxZoom: 8, attributionControl: { compact: true } });
      map.on("load", () => {
        map?.addSource("mexico-study-area", { type: "geojson", data: aoiUrl });
        map?.addLayer({ id: "mexico-study-outline", type: "line", source: "mexico-study-area", layout: { visibility: "none" }, paint: { "line-color": "#ffc37e", "line-width": 2, "line-dasharray": [2, 1.5] } });
        void fetch("/data/regions/mexico_city/series.json").then((response) => response.ok ? response.json() : null).then((series) => {
          const range = series?.velocity_range_cm_per_year;
          if (!canceled && Array.isArray(range) && range.length === 2) setVelocityLimit(Math.max(Math.abs(Number(range[0])), Math.abs(Number(range[1]))));
        }).catch(() => undefined);
        void fetch(boundsUrl).then((response) => response.ok ? response.json() : null).then((bounds) => {
          const corners = bounds?.["overlay_velocity.png"]?.corners_lonlat_TL_TR_BR_BL;
          if (canceled || !map || !corners) return;
          map.addSource("mexico-velocity", { type: "image", url: velocityUrl, coordinates: corners });
          map.addLayer({ id: "mexico-velocity-layer", type: "raster", source: "mexico-velocity", layout: { visibility: showMexicoOverlay.current ? "visible" : "none" }, paint: { "raster-opacity": 0.88, "raster-fade-duration": 0 } });
          map.moveLayer("mexico-study-outline");
        }).catch(() => setMessage("Mexico velocity overlay is unavailable; the region page remains available."));
      });

      const addMarker = (label: string, coordinates: [number, number], draft = false) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = draft ? "world-marker world-marker-draft" : "world-marker world-marker-observed";
        element.setAttribute("aria-label", draft ? `${label}. Draft, not approved. No observations are loaded.` : `${label}. Observations available.`);
        element.title = draft ? `${label} — Draft, not approved · no observations are loaded` : `${label} — observed velocity data available`;
        element.innerHTML = `<span class="world-marker-dot"></span><span class="world-marker-label">${label}</span>`;
        if (draft) {
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            new Popup({ closeButton: true, closeOnClick: true, offset: 15, className: "draft-map-popup" }).setLngLat(coordinates).setHTML(`<strong>${label}</strong><br/>Draft, not approved.<br/>No observations are loaded.`).addTo(map!);
          });
        } else {
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!map) return;
            showMexicoOverlay.current = true;
            setMexicoSelected(true);
            if (prefersReducedMotion()) map.jumpTo({ center: [-99.13, 19.4], zoom: 9.5 });
            else map.flyTo({ center: [-99.13, 19.4], zoom: 9.5, duration: 1500 });
            const reveal = () => {
              if (map?.getLayer("mexico-study-outline")) map.setLayoutProperty("mexico-study-outline", "visibility", "visible");
              if (map?.getLayer("mexico-velocity-layer")) map.setLayoutProperty("mexico-velocity-layer", "visibility", "visible");
            };
            if (map.isStyleLoaded()) reveal();
            else map.once("idle", reveal);
          });
        }
        markers.push(new Marker({ element, anchor: "center" }).setLngLat(coordinates).addTo(map!));
      };
      addMarker("Mexico City", [-99.1344, 19.4706]);
      addMarker("Majuli–Jorhat · draft", [94.17, 26.95], true);
      addMarker("Pine Island Glacier · draft", [-100, -75.16667], true);
      map.on("error", () => setMessage("Live basemap tiles are unavailable. The region links remain available below."));
    }).catch(() => setMessage("The interactive map could not be initialized. Region links remain available below."));
    return () => { canceled = true; markers.forEach((marker) => marker.remove()); map?.remove(); };
  }, []);

  return <div className="world-map-wrap"><div className="world-map" ref={container} aria-label="Interactive map of TerraWatch study-area locations"/>
    <div className="map-overline"><b>STUDY AREAS</b><span>Choose a marker to explore</span></div>
    <div className="world-map-legend"><span className="legend-dot observed"/> Observations available <span className="legend-dot draft"/> Draft · not approved</div>
    {mexicoSelected && <><div className="home-velocity-legend">{velocityLimit === null ? <span>Rate legend unavailable</span> : <><span>−{velocityLimit} cm/year</span><i/><span>0</span><i/><span>+{velocityLimit} cm/year</span></>}</div><p className="home-caveat-chip">Line of sight, relative to estimated stable ground</p><Link className="home-time-machine-link" href="/regions/mexico-city#time-machine">Open Mexico City Time Machine ↗</Link></>}
    {message && <p className="world-map-message" role="status">{message}</p>}
  </div>;
}

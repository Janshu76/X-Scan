from __future__ import annotations

from typing import Any


def build_mexico_findings(summary: dict[str, Any], gnss_comparison: dict[str, Any] | None) -> list[dict[str, Any]]:
    velocity = summary["velocity_cm_per_year"]
    shares = summary["share_of_valid_pixels_percent"]
    adjustment = summary["stable_ground_adjustment"]
    station_count = len((gnss_comparison or {}).get("stations", []))
    span = f"{summary['period'][0]} to {summary['period'][1]}"
    dataset = "mexico-city-opera-adjusted"
    run = "mexico-city-script-24"
    return [
        {
            "id": "mexico-adjusted-velocity-distribution",
            "region_id": "mexico_city",
            "evidence_label": "Measured",
            "public_statement": f"For the adjusted sampled area ({span}), the 2nd-percentile LOS velocity is {velocity['p2']:.2f} cm/year. This is a sample-based distribution indicator, not the rate at every location.",
            "research_statement": f"OPERA L3 DISP-S1 adjusted sample summary: p2={velocity['p2']:.2f}, median={velocity['median']:.2f}, p98={velocity['p98']:.2f} cm/year LOS. Source: {summary['source']}.",
            "dataset_ids": [dataset], "processing_run_ids": [run],
            "limitations": ["Compact sampled statistic, not a full-scene pixel calculation.", "LOS is not vertical motion."],
            "uncertainty": "Relative to estimated stable ground; atmospheric correction is incomplete.",
        },
        {
            "id": "mexico-adjusted-sinking-shares",
            "region_id": "mexico_city",
            "evidence_label": "Observed",
            "public_statement": f"The adjusted product summary reports {shares['sinking_faster_than_3_cm_per_year']:.1f}% of valid pixels faster than 3 cm/year LOS and {shares['sinking_faster_than_10_cm_per_year']:.1f}% faster than 10 cm/year LOS.",
            "research_statement": "Percent shares are from the supplied adjusted summary and use its valid-pixel mask.",
            "dataset_ids": [dataset], "processing_run_ids": [run],
            "limitations": ["These fractions describe the valid mask and are not exposure or damage estimates."],
            "uncertainty": "Depends on the adjusted reference and common-valid-pixel mask.",
        },
        {
            "id": "mexico-stable-ground-assumption",
            "region_id": "mexico_city",
            "evidence_label": "Contextual",
            "public_statement": "The displayed values are relative to estimated stable ground. The adjustment assumes most of the scene is stable and a uniform offset applies everywhere; this is not proven.",
            "research_statement": f"The adjusted pack subtracted {adjustment['offset_subtracted_cm_per_year']:.2f} cm/year scene-most-common LOS velocity. The stated assumption is: {adjustment['assumption']}.",
            "dataset_ids": [dataset], "processing_run_ids": [run],
            "limitations": ["Atmosphere is not fully corrected.", "Chained blocks can accumulate error."],
            "uncertainty": "The stable-ground and uniform-offset assumptions are not independently established.",
        },
        {
            "id": "mexico-gnss-adjustment-check",
            "region_id": "mexico_city",
            "evidence_label": "Contextual",
            "public_statement": f"Two quiet GNSS stations were used only for an independent adjustment check; the available comparison covers {station_count} stations. It is approximate because GNSS is vertical and InSAR is line of sight.",
            "research_statement": "GNSS was not used to set the offset. Station coverage and measurement directions differ; interpret as a limited consistency check, not validation.",
            "dataset_ids": ["mexico-city-context"], "processing_run_ids": [run],
            "limitations": ["Few stations and uneven period coverage.", "Vertical GNSS and LOS InSAR are not equivalent measurements."],
            "uncertainty": "Approximate independent check; not validation of the adjustment.",
        },
        {
            "id": "mexico-groundwater-not-tested",
            "region_id": "mexico_city",
            "evidence_label": "Possible explanation",
            "public_statement": "Groundwater extraction is discussed in published research as a possible contributor to ground compaction; this app has no groundwater observations to test that explanation.",
            "research_statement": "No groundwater-level, pumping, or well dataset is registered for this region. Literature context is not a project measurement.",
            "dataset_ids": [], "processing_run_ids": [],
            "limitations": ["Cause attribution is not tested."],
            "uncertainty": "Possible explanation only; no local groundwater evidence is available in this project.",
        },
        {
            "id": "assam-observations-unavailable",
            "region_id": "assam",
            "evidence_label": "Unavailable",
            "public_statement": "No Assam satellite observations have been added.",
            "research_statement": "Flood inundation, river migration, erosion and deposition are separate planned analyses; no regional measurement is available.",
            "dataset_ids": [], "processing_run_ids": [],
            "limitations": ["Draft AOI is not approved."], "uncertainty": "No observations available.",
        },
        {
            "id": "antarctica-observations-unavailable",
            "region_id": "antarctica",
            "evidence_label": "Unavailable",
            "public_statement": "No Pine Island Glacier observations have been added.",
            "research_statement": "Ice velocity, shelf extent, elevation and mass balance remain distinct planned measurements; none is available here.",
            "dataset_ids": [], "processing_run_ids": [],
            "limitations": ["Draft AOI is not approved."], "uncertainty": "No observations available.",
        },
    ]

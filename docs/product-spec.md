# TerraWatch Phase 1 product scope

> Scope source: the user's combined Phase 1 task instructions supplied in this
> Codex session. A separate full product-spec document was not present in the
> checkout or supplied attachment. This file records only the concrete Phase 1
> work-package requirements; it does not fill in missing Phase 2 or Phase 3
> material. Replace this scope note with the canonical saved specification
> when available.

## Product purpose

TerraWatch is an evidence-led Earth observation application. It provides a
plain-language Public View and a detailed Research View over shared findings
and dataset provenance. Region coverage is limited to real data present in the
repository. Missing datasets remain explicitly unavailable.

## Phase 1 work packages

1. **Views:** persistent Public/Research selector; public overview with an
   Earth map, region cards, featured story placeholders, and four discovery
   sections; research workspace with observation status, provenance, interval
   analysis, confidence and processing metadata. Both views share data and
   preserve static-file operation.
2. **Backend foundation:** FastAPI service, migrations, local database and a
   database-backed worker. SQLite is the development fallback when PostgreSQL
   cannot be connected; PostgreSQL/PostGIS remains the intended database.
3. **Shared model/findings:** regions, datasets/files, manifest records,
   searches, jobs, processing runs, and evidence-labelled findings with public
   and research wording, evidence links, limitations and uncertainty.
4. **Data Library:** catalog and manifest listing, status, size and app usage;
   safe user-supplied file registration with provenance and format validation.
5. **Acquisition:** ASF search and explicitly selected downloads, with
   authenticated access, progress, duplicate/integrity checks and manifest
   registration. Other provider adapters remain marked unimplemented.
6. **Regions:** Mexico City data; Assam and Pine Island Glacier pages with
   explicitly draft, unapproved AOIs and no invented observations.
7. **Time Machine and SAR Lab:** real available imagery, baseline handling,
   compare, timeline, legends, truthful NISAR context and unavailable-layer
   explanations.
8. **Impact Explorer:** honest placeholders for exposure/context layers; no
   damage or risk inference.
9. **Setup and verification:** Windows setup, data seed, automated tests and
   safe credential instructions.

## Evidence and data constraints

- Never invent observations, dates, sources, values or processing results.
- Display visible labels: Observed, Measured, Contextual, Possible explanation,
  Simulated and Unavailable.
- Mexico City values are line-of-sight relative to estimated stable ground;
  atmosphere is not fully corrected. Groundwater is a possible explanation,
  not a tested cause. NISAR is PROVISIONAL context only.
- Assam analyses must distinguish flood inundation, river migration, erosion
  and deposition. Antarctica must distinguish ice velocity, shelf extent,
  elevation and mass balance.
- Keep credentials out of source, UI, logs, data and Git. Do not commit `.env`,
  raw downloads, `.nc`, `.h5`, `.npz`, or any file larger than 25 MB.
- Record provider, dates, resolution, licence and attribution, using `unknown`
  where metadata is absent.

## Deferred

Phase 2 scientific pipelines and Phase 3 documentaries, storyboards, video
export, simulation and language-model features are out of scope. Any existing
template answer remains explicitly non-AI and grounded in displayed evidence.

CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    aoi_json TEXT,
    aoi_status TEXT NOT NULL,
    notes TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    product TEXT NOT NULL,
    dates_json TEXT NOT NULL,
    resolution TEXT NOT NULL,
    license TEXT NOT NULL,
    processing TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY(region_id) REFERENCES regions(id)
);
CREATE TABLE IF NOT EXISTS dataset_files (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    path TEXT NOT NULL,
    status TEXT NOT NULL,
    size_bytes TEXT NOT NULL,
    appearance TEXT NOT NULL,
    FOREIGN KEY(dataset_id) REFERENCES datasets(id)
);
CREATE TABLE IF NOT EXISTS manifest_entries (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    dataset_name TEXT NOT NULL,
    source TEXT NOT NULL,
    product_id TEXT NOT NULL,
    acquisition_date TEXT NOT NULL,
    downloaded_on TEXT NOT NULL,
    product_type TEXT NOT NULL,
    resolution TEXT NOT NULL,
    crs TEXT NOT NULL,
    license TEXT NOT NULL,
    processing_level TEXT NOT NULL,
    file_path TEXT NOT NULL,
    quality_notes TEXT NOT NULL,
    FOREIGN KEY(region_id) REFERENCES regions(id)
);
CREATE TABLE IF NOT EXISTS search_results (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    searched_at TEXT NOT NULL,
    criteria_json TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    status TEXT NOT NULL,
    FOREIGN KEY(region_id) REFERENCES regions(id)
);
CREATE TABLE IF NOT EXISTS processing_runs (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    script_name TEXT NOT NULL,
    input_dataset_id TEXT NOT NULL,
    output_dataset_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT NOT NULL,
    FOREIGN KEY(region_id) REFERENCES regions(id)
);
CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    evidence_label TEXT NOT NULL CHECK (evidence_label IN ('Observed', 'Measured', 'Contextual', 'Possible explanation', 'Simulated', 'Unavailable')),
    public_statement TEXT NOT NULL,
    research_statement TEXT NOT NULL,
    dataset_ids_json TEXT NOT NULL,
    processing_run_ids_json TEXT NOT NULL,
    limitations_json TEXT NOT NULL,
    uncertainty TEXT NOT NULL,
    FOREIGN KEY(region_id) REFERENCES regions(id)
);
CREATE INDEX IF NOT EXISTS idx_datasets_region ON datasets(region_id);
CREATE INDEX IF NOT EXISTS idx_findings_region ON findings(region_id);
CREATE INDEX IF NOT EXISTS idx_manifest_region ON manifest_entries(region_id);

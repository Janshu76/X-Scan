ALTER TABLE dataset_files ADD COLUMN checksum TEXT;
ALTER TABLE dataset_files ADD COLUMN source TEXT;
ALTER TABLE dataset_files ADD COLUMN acquisition_date TEXT;
ALTER TABLE dataset_files ADD COLUMN license TEXT;
ALTER TABLE dataset_files ADD COLUMN format TEXT;
ALTER TABLE dataset_files ADD COLUMN crs TEXT;
ALTER TABLE dataset_files ADD COLUMN bounds_json TEXT;
ALTER TABLE dataset_files ADD COLUMN registered_at TEXT;

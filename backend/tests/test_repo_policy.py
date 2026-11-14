from pathlib import Path
from scripts.verify_repo import audit


def test_repo_audit_rejects_secrets_raw_paths_banned_formats_and_large_files(tmp_path):
    (tmp_path / "sample.bin").write_bytes(b"x" * (25 * 1024 * 1024 + 1))
    issues = audit([".env", "raw/clips/chunk.npz", "source.nc", "sample.bin", "data/catalog/datasets.json"], tmp_path)
    assert any(".env" in issue for issue in issues)
    assert any("raw/clips" in issue for issue in issues)
    assert any("source.nc" in issue for issue in issues)
    assert any("sample.bin" in issue for issue in issues)
    assert len(issues) == 4


def test_repo_audit_accepts_small_catalog_files(tmp_path):
    catalog = tmp_path / "data" / "catalog" / "datasets.json"
    catalog.parent.mkdir(parents=True)
    catalog.write_text("{}", encoding="utf-8")
    assert audit(["data/catalog/datasets.json"], tmp_path) == []

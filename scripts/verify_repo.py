from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_SUFFIXES = {".env", ".nc", ".h5", ".npz"}
FORBIDDEN_PARTS = {"raw", "originals", "clips", "osm_cache", "gnss"}
MAX_BYTES = 25 * 1024 * 1024


def audit(paths: list[str], root: Path = ROOT) -> list[str]:
    problems: list[str] = []
    for name in paths:
        path = Path(name)
        lowered_parts = {part.lower() for part in path.parts}
        if path.name.lower() == ".env" or path.suffix.lower() in FORBIDDEN_SUFFIXES or lowered_parts & FORBIDDEN_PARTS:
            problems.append(f"forbidden tracked path: {name}")
            continue
        full_path = root / path
        if full_path.is_file() and full_path.stat().st_size > MAX_BYTES:
            problems.append(f"tracked file exceeds 25 MiB: {name}")
    return problems


def main() -> int:
    result = subprocess.run(["git", "ls-files", "--cached", "-z"], cwd=ROOT, check=True, capture_output=True)
    paths = [item.decode("utf-8", errors="replace") for item in result.stdout.split(b"\0") if item]
    problems = audit(paths)
    if problems:
        print("Repository policy check failed:")
        print("\n".join(f"- {problem}" for problem in problems))
        return 1
    print(f"Repository policy check passed: {len(paths)} indexed paths; no secret/raw paths, banned satellite formats, or files over 25 MiB.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Explicit role migration, including dry-run and an untouched v1 backup."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from kapa_planung.services.roles import prepare_snapshot


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    original = args.path.read_bytes()
    source = json.loads(original.decode("utf-8-sig"))
    result = prepare_snapshot(source)
    if source.get("version") == 2:
        print("Version 2 ist bereits vorhanden und gültig. Keine Änderung.")
        return 0
    print(f"Version 1 -> 2: {len(result['people'])} Personen, {len(result['roles'])} Rollen. Projektwerte unverändert.")
    if args.dry_run:
        print("Vorschau: Keine Datei verändert.")
        return 0
    backup = args.path.with_name(args.path.stem + ".vor-rollen-v2.json")
    # A previous backup is never overwritten, even when the command is repeated.
    with backup.open("xb") as handle:
        handle.write(original)
    result["_revision"] = source.get("_revision", 0) + 1
    temporary = args.path.with_suffix(".migration.tmp")
    try:
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(args.path)
    finally:
        temporary.unlink(missing_ok=True)
    print("Migration abgeschlossen. Die ursprüngliche Datei wurde gesichert.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

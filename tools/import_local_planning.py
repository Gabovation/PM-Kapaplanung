"""Einmalige Übernahme einer vorhandenen JSON-Planung; standardmäßig nur prüfen."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.local_packages'), str(ROOT / 'src')]

from pymongo.errors import PyMongoError  # noqa: E402
from kapa_planung.ops_platform.config import load_project_env  # noqa: E402
from kapa_planung.repositories.server_store import RevisionConflict, ServerStore  # noqa: E402
from kapa_planung.services.planning import validate_assignments, validate_hour_plans  # noqa: E402
from kapa_planung.services.roles import prepare_snapshot  # noqa: E402


def load_validated(source: Path):
    raw = source.read_bytes()
    if len(raw) > 5_000_000:
        raise ValueError('Die Sicherung ist größer als 5 MB.')
    snapshot = prepare_snapshot(json.loads(raw.decode('utf-8-sig')))
    validate_assignments(snapshot)
    validate_hour_plans(snapshot)
    snapshot['_revision'] = 0
    return raw, snapshot


def import_empty(store, raw, snapshot, backup: Path):
    if store.read_planning() is not None:
        raise RevisionConflict('Auf dem Server ist bereits eine Planung vorhanden.')
    # Exclusive creation never overwrites an existing backup.
    with backup.open('xb') as out:
        out.write(raw)
    if hashlib.sha256(backup.read_bytes()).digest() != hashlib.sha256(raw).digest():
        raise OSError('Sicherung konnte nicht verifiziert werden.')
    return store.save_planning(snapshot, actor='initialimport')


def main():
    parser = argparse.ArgumentParser(description='Vorhandene Planung einmalig in leere Serverplanung übernehmen.')
    parser.add_argument('source', type=Path, help='Pfad zur lokalen JSON-Sicherung')
    parser.add_argument('--apply', action='store_true', help='Import nach Prüfung und Sicherung tatsächlich ausführen')
    parser.add_argument('--backup', type=Path, help='Neuer, geschützter Sicherungspfad; erforderlich bei --apply')
    args = parser.parse_args()
    try:
        raw, snapshot = load_validated(args.source)
        print(f"Prüfung erfolgreich: {len(snapshot['projects'])} Projekte, {len(snapshot['people'])} Personen.")
        if not args.apply:
            print('Nur geprüft; weder Datenbank noch Dateien wurden verändert.')
            return 0
        if args.backup is None:
            raise ValueError('Für den Import ist ein neuer Sicherungspfad mit --backup erforderlich.')
        load_project_env(ROOT)
        store = ServerStore.from_environment()
        try:
            revision = import_empty(store, raw, snapshot, args.backup)
        finally:
            store.close()
        print(f'Import abgeschlossen. Revision: {revision}.')
        return 0
    except (ValueError, OSError, UnicodeError, json.JSONDecodeError, PyMongoError, RevisionConflict):
        print('Import abgebrochen. Bitte Quelle, Sicherungspfad, Serverplanung und Datenbankverbindung prüfen.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

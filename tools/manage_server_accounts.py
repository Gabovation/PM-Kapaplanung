"""Konten und benötigten Sitzungsindex für den eigenständigen Serverbetrieb einrichten."""
from __future__ import annotations

import argparse
import getpass
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.local_packages'), str(ROOT / 'src')]

from pymongo.errors import DuplicateKeyError, PyMongoError  # noqa: E402
from kapa_planung.ops_platform.config import load_project_env  # noqa: E402
from kapa_planung.repositories.server_store import ServerStore  # noqa: E402
from kapa_planung.services.server_auth import hash_password, normalize_username  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description='Serverkonten der Kapazitätsplanung verwalten.')
    parser.add_argument('action', choices=['init-indexes', 'create', 'reset', 'enable', 'disable'])
    parser.add_argument('--username', help='Benutzername, niemals ein Passwort')
    parser.add_argument('--role', choices=['admin', 'pl', 'qvp', 'ho_pm', 'editor', 'reader'], default='pl')
    args = parser.parse_args()
    load_project_env(ROOT)
    try:
        store = ServerStore.from_environment()
        if args.action == 'init-indexes':
            store.initialize_indexes()
            print('Sitzungsindex der Kapazitätsplanung eingerichtet.')
            return 0
        username = normalize_username(args.username or '')
        if args.action in ('create', 'reset'):
            password = getpass.getpass('Passwort: ')
            if password != getpass.getpass('Passwort wiederholen: '):
                raise ValueError('Die Passwörter stimmen nicht überein.')
            encoded = hash_password(password)
            if args.action == 'create':
                store.create_user(username, encoded, args.role)
            elif not store.set_password(username, encoded):
                raise ValueError('Dieses Konto existiert nicht.')
        elif not store.set_active(username, args.action == 'enable'):
            raise ValueError('Dieses Konto existiert nicht.')
        print('Konto aktualisiert.')
        return 0
    except DuplicateKeyError:
        print('Dieser Benutzername ist bereits vergeben.', file=sys.stderr)
    except (ValueError, PyMongoError):
        print('Die Aktion ist fehlgeschlagen. Bitte Eingaben, Konfiguration und Datenbankverbindung prüfen.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())

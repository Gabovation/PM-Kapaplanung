from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import uuid

import pytest

from kapa_planung.services.roles import prepare_snapshot, validate_roles

ROOT = Path(__file__).resolve().parents[1]


def legacy_snapshot():
    return {'version': 1, '_revision': 7, 'fte': 40, 'favorite': [20, 20, 20, 40],
            'people': [{'id': 'p1', 'name': 'Test', 'role': 'Projektleitung', 'fte': 50},
                       {'id': 'p2', 'name': 'Test QVP', 'role': 'QVP', 'fte': 100},
                       {'id': 'p3', 'name': 'Test eigene Rolle', 'role': 'Versuchsplanung', 'fte': 100}],
            'projects': [{'id': 'project1', 'person': 'p1', 'budget': 800}]}


def test_explicit_migration_preserves_projects_fte_and_custom_roles():
    original = legacy_snapshot()
    unchanged = deepcopy(original)
    migrated = prepare_snapshot(original)
    assert original == unchanged
    assert migrated['version'] == 2
    assert migrated['projects'] == original['projects']
    assert migrated['people'][0]['fte'] == 50
    assert [role['name'] for role in migrated['roles']] == ['Projektleiter', 'QVP', 'Versuchsplanung']
    assert migrated['people'][0]['roleId'] == 'project-manager'
    assert migrated['people'][1]['roleId'] == 'qvp'
    assert all('role' not in person for person in migrated['people'])
    assert prepare_snapshot(original) == migrated
    assert prepare_snapshot(migrated) == migrated


@pytest.mark.parametrize('kind', ['duplicate_name', 'duplicate_id', 'unknown_role', 'invalid_role_id', 'empty_name'])
def test_rejects_invalid_catalogue_and_assignments(kind):
    snapshot = prepare_snapshot(legacy_snapshot())
    if kind == 'duplicate_name':
        snapshot['roles'].append({'id': 'new-role', 'name': 'qvp'})
    elif kind == 'duplicate_id':
        snapshot['roles'].append({'id': 'qvp', 'name': 'Neue Rolle'})
    elif kind == 'unknown_role':
        snapshot['people'][0]['roleId'] = 'missing'
    elif kind == 'invalid_role_id':
        snapshot['people'][0]['roleId'] = {}
    else:
        snapshot['roles'][0]['name'] = ' '
    with pytest.raises(ValueError):
        validate_roles(snapshot)


def test_cli_dry_run_backup_and_repeat_are_safe():
    source = ROOT / ('test-roles-' + uuid.uuid4().hex + '.json')
    backup = source.with_name(source.stem + '.vor-rollen-v2.json')
    original = json.dumps(legacy_snapshot(), ensure_ascii=False).encode('utf-8')
    source.write_bytes(original)
    try:
        command = [sys.executable, str(ROOT / 'tools/migrate_roles.py'), str(source)]
        assert subprocess.run(command + ['--dry-run'], capture_output=True).returncode == 0
        assert source.read_bytes() == original
        assert not backup.exists()
        assert subprocess.run(command, capture_output=True).returncode == 0
        assert backup.read_bytes() == original
        migrated = source.read_bytes()
        assert json.loads(migrated)['version'] == 2
        assert json.loads(migrated)['_revision'] == 8
        assert subprocess.run(command, capture_output=True).returncode == 0
        assert source.read_bytes() == migrated
        assert backup.read_bytes() == original
    finally:
        source.unlink(missing_ok=True)
        backup.unlink(missing_ok=True)

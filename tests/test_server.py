from __future__ import annotations
import json
from pathlib import Path
import sys
import uuid
import pytest
ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / '.local_packages'), str(ROOT / 'src')]
from kapa_planung import web

@pytest.fixture
def local_client(monkeypatch):
    path = ROOT / ('test-data-' + uuid.uuid4().hex + '.json')
    monkeypatch.setattr(web, 'DATA', path)
    monkeypatch.setenv('APP_ENV', 'local')
    app = web.create_app(); app.config['TESTING'] = True
    yield app.test_client()
    path.unlink(missing_ok=True)

def test_shell_and_data_write_conflict(local_client):
    page = local_client.get('/')
    assert page.status_code == 200
    assert b'ops-workspace' in page.data and b'kapa-app' in page.data
    assert local_client.get('/api/data').json is None
    payload = {'version': 2, 'people': [], 'projects': [], 'roles': [{'id': 'pm', 'name': 'Projektleiter'}], '_revision': 0}
    assert local_client.post('/api/data', json=payload).status_code == 403
    headers = {'X-Kapa-Token': web.TOKEN}
    assert local_client.post('/api/data', json=payload, headers=headers).json == {'revision': 1}
    assert local_client.post('/api/data', json=payload, headers=headers).status_code == 409
    assert local_client.get('/api/data').json['_revision'] == 1
    assert local_client.get('/planung.json').status_code == 404

def test_rejects_nonlocal_mode(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'prd')
    with pytest.raises(RuntimeError): web.create_app()


def test_role_rename_persists_without_changing_person_assignment(local_client):
    payload = {'version': 2, 'roles': [{'id': 'qvp', 'name': 'QVP'}],
               'people': [{'id': 'person-1', 'name': 'Test', 'roleId': 'qvp', 'fte': 100}],
               'projects': [], '_revision': 0}
    headers = {'X-Kapa-Token': web.TOKEN}
    assert local_client.post('/api/data', json=payload, headers=headers).status_code == 200
    payload['roles'][0]['name'] = 'Qualitätsvorausplanung'
    payload['_revision'] = 1
    assert local_client.post('/api/data', json=payload, headers=headers).status_code == 200
    loaded = local_client.get('/api/data').json
    assert loaded['roles'][0]['name'] == 'Qualitätsvorausplanung'
    assert loaded['people'][0]['roleId'] == 'qvp'


def test_missing_role_is_rejected_without_overwriting_data(local_client):
    payload = {'version': 2, 'roles': [{'id': 'pm', 'name': 'Projektleiter'}],
               'people': [{'id': 'person-1', 'roleId': 'missing'}], 'projects': [], '_revision': 0}
    assert local_client.post('/api/data', json=payload, headers={'X-Kapa-Token': web.TOKEN}).status_code == 400
    assert local_client.get('/api/data').json is None


def test_legacy_backup_import_is_prepared_without_writing(local_client):
    payload = {'version': 1, 'people': [{'id': 'p1', 'name': 'Test', 'role': 'Projektleitung', 'fte': 100}],
               'projects': [], 'fte': 40, 'favorite': [20, 20, 20, 40]}
    assert local_client.post('/api/prepare-import', json=payload).status_code == 403
    response = local_client.post('/api/prepare-import', json=payload, headers={'X-Kapa-Token': web.TOKEN})
    assert response.status_code == 200
    assert response.json['version'] == 2
    assert response.json['people'][0]['roleId'] == 'project-manager'
    assert local_client.get('/api/data').json is None

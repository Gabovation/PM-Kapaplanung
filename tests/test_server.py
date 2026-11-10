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
    payload = {'version': 1, 'people': [], 'projects': [], '_revision': 0}
    assert local_client.post('/api/data', json=payload).status_code == 403
    headers = {'X-Kapa-Token': web.TOKEN}
    assert local_client.post('/api/data', json=payload, headers=headers).json == {'revision': 1}
    assert local_client.post('/api/data', json=payload, headers=headers).status_code == 409
    assert local_client.get('/api/data').json['_revision'] == 1
    assert local_client.get('/planung.json').status_code == 404

def test_rejects_nonlocal_mode(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'prd')
    with pytest.raises(RuntimeError): web.create_app()

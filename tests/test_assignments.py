from copy import deepcopy
import uuid

import pytest

from kapa_planung.services.planning import validate_assignments
from kapa_planung import web


def sample():
    return {'version': 2, 'roles': [{'id': 'project-manager', 'name': 'Projektleiter'}, {'id': 'qvp', 'name': 'QVP'}],
            'people': [{'id': 'a', 'roleId': 'project-manager'}, {'id': 'b', 'roleId': 'project-manager'}, {'id': 'q', 'roleId': 'qvp'}],
            'projects': [{'person': 'a', 'secondPerson': 'b', 'leadPercent': 60, 'qvpPerson': 'q', 'qvpBudget': 101}]}


def test_valid_assignment_and_legacy_snapshot_remain_unchanged():
    data = sample()
    before = deepcopy(data)
    validate_assignments(data)
    assert data == before
    data['projects'] = [{'person': 'a'}, {'person': ''}]
    validate_assignments(data)


@pytest.mark.parametrize('patch', [
    {'secondPerson': 'a'}, {'secondPerson': 'missing'}, {'person': ''},
    {'leadPercent': 101}, {'leadPercent': -1}, {'leadPercent': 50.5},
    {'leadPercent': True}, {'qvpPerson': 'missing'}, {'qvpBudget': -1},
    {'qvpBudget': 1.5}, {'qvpBudget': True}, {'qvpBudget': 1_000_001},
])
def test_invalid_new_assignments_are_rejected(patch):
    data = sample()
    data['projects'][0].update(patch)
    with pytest.raises(ValueError):
        validate_assignments(data)


def test_invalid_assignment_is_rejected_by_write_and_import(client, monkeypatch):
    monkeypatch.setattr(web, 'DATA', web.DATA.with_name('test-invalid-assignments-never-created.json'))
    data = sample()
    data['projects'][0]['secondPerson'] = 'a'
    headers = {'X-Kapa-Token': web.TOKEN}
    assert client.post('/api/data', json=data, headers=headers).status_code == 400
    assert client.post('/api/prepare-import', json=data, headers=headers).status_code == 400
    assert not web.DATA.exists()


def test_assignment_round_trip_through_api(client, monkeypatch):
    path = web.DATA.with_name('test-data-' + uuid.uuid4().hex + '.json')
    monkeypatch.setattr(web, 'DATA', path)
    data = sample()
    headers = {'X-Kapa-Token': web.TOKEN}
    try:
        response = client.post('/api/data', json=data, headers=headers)
        assert response.status_code == 200
        loaded = client.get('/api/data').get_json()['projects'][0]
        assert loaded['person'] == 'a'
        assert loaded['secondPerson'] == 'b'
        assert loaded['leadPercent'] == 60
        assert loaded['qvpPerson'] == 'q'
        assert loaded['qvpBudget'] == 101
    finally:
        path.unlink(missing_ok=True)

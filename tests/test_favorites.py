from copy import deepcopy
import uuid

import pytest

from kapa_planung import web
from kapa_planung.services.planning import validate_assignments
from kapa_planung.services.roles import prepare_snapshot, validate_roles


def snapshot():
    return {
        'version': 2, '_revision': 0, 'fte': 40, 'favorite': [20, 20, 20, 40],
        'roles': [{'id': 'project-manager', 'name': 'Projektleiter'}, {'id': 'qvp', 'name': 'QVP'}, {'id': 'test', 'name': 'Testrolle'}],
        'roleFavorites': {'project-manager': [40, 30, 20, 10], 'qvp': [0, 0, 30, 70], 'test': [25, 25, 25, 25]},
        'people': [],
        'projects': [{'id': 'p1', 'person': '', 'budget': 800, 'percent': [40, 30, 20, 10], 'qvpBudget': 200,
                      'qvpPercent': [0, 0, 30, 70], 'dates': ['2026-01-01', '2026-04-01', '2026-07-01', '2027-01-01', '2027-07-01']}],
    }


@pytest.mark.parametrize('bad', [[20, 20, 20], [20, 20, 20, 39], [20, 20, 20, True], [20, 20, 20, -1], 'invalid'])
def test_invalid_role_favorites_and_qvp_distribution_are_rejected(bad):
    data = snapshot()
    data['roleFavorites']['qvp'] = bad
    with pytest.raises(ValueError):
        validate_roles(data)
    data = snapshot()
    data['projects'][0]['qvpPercent'] = bad
    with pytest.raises(ValueError):
        validate_assignments(data)


def test_unknown_role_favorite_is_rejected():
    data = snapshot()
    data['roleFavorites']['unknown'] = [25, 25, 25, 25]
    with pytest.raises(ValueError):
        validate_roles(data)


def test_bad_favorites_are_rejected_by_both_write_and_import(client, monkeypatch):
    data = snapshot()
    data['roleFavorites']['qvp'] = [0, 0, 40, 40]
    headers = {'X-Kapa-Token': web.TOKEN}
    monkeypatch.setattr(web, 'DATA', web.DATA.with_name('test-favorites-invalid-never-created.json'))
    assert client.post('/api/data', json=data, headers=headers).status_code == 400
    assert client.post('/api/prepare-import', json=data, headers=headers).status_code == 400
    data = snapshot()
    data['projects'][0]['qvpPercent'] = [50, 50, 50, 50]
    assert client.post('/api/data', json=data, headers=headers).status_code == 400
    assert client.post('/api/prepare-import', json=data, headers=headers).status_code == 400


def test_legacy_data_keeps_its_original_values():
    data = snapshot()
    del data['roleFavorites']
    del data['projects'][0]['qvpPercent']
    original = deepcopy(data)
    assert prepare_snapshot(data) == original
    validate_assignments(data)
    assert data == original


def test_favorites_and_distributions_round_trip_through_api(client, monkeypatch):
    path = web.DATA.with_name('test-favorites-' + uuid.uuid4().hex + '.json')
    monkeypatch.setattr(web, 'DATA', path)
    data = snapshot()
    headers = {'X-Kapa-Token': web.TOKEN}
    try:
        assert client.post('/api/data', json=data, headers=headers).status_code == 200
        result = client.get('/api/data').get_json()
        assert result['roleFavorites'] == data['roleFavorites']
        assert result['projects'][0]['qvpPercent'] == [0, 0, 30, 70]
        prepared = client.post('/api/prepare-import', json=data, headers=headers)
        assert prepared.status_code == 200
        assert prepared.get_json()['roleFavorites'] == data['roleFavorites']
    finally:
        path.unlink(missing_ok=True)

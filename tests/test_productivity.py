from copy import deepcopy
import uuid

import pytest

from kapa_planung import web
from kapa_planung.services.roles import prepare_snapshot, validate_roles


def snapshot():
    return {'version': 2, '_revision': 0, 'fte': 40, 'favorite': [20, 20, 20, 40],
            'roles': [{'id': 'pl', 'name': 'Projektleiter', 'productivityTarget': 80}],
            'people': [{'id': 'a', 'name': 'Anna', 'roleId': 'pl', 'fte': 50, 'productivityTarget': 10}],
            'projects': []}


@pytest.mark.parametrize('bad', [-1, 101, True, '80', float('inf'), float('nan')])
@pytest.mark.parametrize('owner', ['roles', 'people'])
def test_invalid_productivity_target_is_rejected(owner, bad):
    data = snapshot()
    data[owner][0]['productivityTarget'] = bad
    with pytest.raises(ValueError):
        validate_roles(data)


def test_legacy_and_inherited_targets_are_accepted_without_migration():
    data = snapshot()
    del data['roles'][0]['productivityTarget']
    del data['people'][0]['productivityTarget']
    before = deepcopy(data)
    assert prepare_snapshot(data) == before
    data['people'][0]['productivityTarget'] = None
    validate_roles(data)
    data['roles'][0]['productivityTarget'] = 0
    validate_roles(data)


def test_target_round_trip_and_backup_import(client, monkeypatch):
    path = web.DATA.with_name('test-productivity-' + uuid.uuid4().hex + '.json')
    monkeypatch.setattr(web, 'DATA', path)
    headers = {'X-Kapa-Token': web.TOKEN}
    data = snapshot()
    try:
        assert client.post('/api/data', json=data, headers=headers).status_code == 200
        saved = client.get('/api/data').get_json()
        assert saved['roles'][0]['productivityTarget'] == 80
        assert saved['people'][0]['productivityTarget'] == 10
        imported = client.post('/api/prepare-import', json=saved, headers=headers)
        assert imported.status_code == 200
        assert imported.get_json()['people'][0]['productivityTarget'] == 10
        data['people'][0]['productivityTarget'] = -1
        assert client.post('/api/prepare-import', json=data, headers=headers).status_code == 400
    finally:
        path.unlink(missing_ok=True)

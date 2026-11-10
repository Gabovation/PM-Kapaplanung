from copy import deepcopy

import pytest

from kapa_planung import web
from kapa_planung.services.planning import validate_hour_plans


def snapshot():
    gates = ['2026-01-01', '2026-01-04', '2026-01-07', '2026-01-10', '2026-01-13']
    project = {'id': 'p1', 'budget': 8, 'percent': [25, 25, 25, 25], 'dates': gates,
               'changes': [{'id': 'c1', 'date': '2026-01-05', 'hours': 5}],
               'hourPlan': {'version': 1, 'granularity': 'month', 'sources': {}}}
    for index in range(4):
        project['hourPlan']['sources'][f'phase-{index}'] = {
            'start': gates[index], 'end': gates[index + 1], 'budget': 2, 'daily': {gates[index]: 2}}
    project['hourPlan']['sources']['change-c1'] = {
        'start': '2026-01-05', 'end': gates[-1], 'budget': 5, 'daily': {'2026-01-11': 5}}
    return {'version': 2, '_revision': 0, 'roles': [{'id': 'pm', 'name': 'Projektleiter'}],
            'people': [], 'projects': [project]}


def test_valid_hour_plan_is_not_changed():
    data = snapshot()
    original = deepcopy(data)
    validate_hour_plans(data)
    assert data == original


@pytest.mark.parametrize('kind', ['fraction', 'negative', 'outside_gate', 'before_change', 'missing_source', 'wrong_sum', 'wrong_budget', 'granularity', 'duplicate_change'])
def test_rejects_invalid_hour_plans(kind):
    data = snapshot()
    project = data['projects'][0]
    plan = project['hourPlan']
    if kind == 'fraction':
        plan['sources']['phase-0']['daily']['2026-01-01'] = 2.5
    elif kind == 'negative':
        plan['sources']['phase-0']['daily']['2026-01-01'] = -2
    elif kind == 'outside_gate':
        plan['sources']['phase-0']['daily'] = {'2026-01-04': 2}
    elif kind == 'before_change':
        plan['sources']['change-c1']['daily'] = {'2026-01-01': 5}
    elif kind == 'missing_source':
        del plan['sources']['change-c1']
    elif kind == 'wrong_sum':
        plan['sources']['phase-0']['daily']['2026-01-01'] = 3
    elif kind == 'wrong_budget':
        plan['sources']['phase-0']['budget'] = 3
    elif kind == 'granularity':
        plan['granularity'] = 'year'
    else:
        project['changes'].append(deepcopy(project['changes'][0]))
    with pytest.raises(ValueError):
        validate_hour_plans(data)


@pytest.mark.parametrize('budget,percent,expected', [(801, [20,20,20,40], [160,160,160,321]), (12, [20,45,0,35], [3,5,0,4])])
def test_phase_rounding_matches_whole_project_budget(budget, percent, expected):
    data = snapshot()
    project = data['projects'][0]
    project.update(budget=budget, percent=percent)
    for index, hours in enumerate(expected):
        source = project['hourPlan']['sources'][f'phase-{index}']
        source.update(budget=hours, daily={source['start']: hours})
    validate_hour_plans(data)


def test_api_validates_hour_sums_before_saving(client, monkeypatch):
    # A read-only failure case needs no temporary directory or writes.
    monkeypatch.setattr(web, 'DATA', web.DATA.with_name('test-invalid-hours-never-created.json'))
    data = snapshot()
    data['projects'][0]['hourPlan']['sources']['phase-0']['daily']['2026-01-01'] = 3
    response = client.post('/api/data', json=data, headers={'X-Kapa-Token': web.TOKEN})
    assert response.status_code == 400
    assert not web.DATA.exists()

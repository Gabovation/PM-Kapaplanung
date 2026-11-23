"""Projektplan: Prüfregeln, Admin-Zugriff und Speicherung ohne MongoDB (einfache Ersatz-Collection)."""
import re
from copy import deepcopy

import pytest
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from kapa_planung.repositories.server_store import ServerStore
from kapa_planung.services.gantt import validate_gantt
from kapa_planung.services.server_auth import hash_password
from kapa_planung.web import create_app


def task(task_id, level=0, links=None, **extra):
    data = {'id': task_id, 'name': task_id.upper(), 'type': 'task', 'level': level, 'start': '2026-05-04',
            'durationDays': 3, 'percent': 0, 'note': '', 'links': links or [], 'snet': None}
    data.update(extra)
    return data


def plan(*tasks, project='p1'):
    return {'projectId': 'p1' if project is None else project, 'tasks': list(tasks)}


def link(source, kind='FS', lag=0):
    return {'from': source, 'type': kind, 'lagDays': lag}


def test_valid_plan_is_accepted():
    validate_gantt(plan(task('a'), task('c', 1), task('m', 1, type='milestone', durationDays=0), task('b', links=[link('m', 'SS', 2), link('c', 'FF', -1)])), 'p1')
    validate_gantt(plan(), 'p1')


@pytest.mark.parametrize('bad', [
    plan(task('a'), task('a')),                                         # doppelte ID
    plan(task('a', level=1)),                                           # Gliederung beginnt nicht oben
    plan(task('a'), task('b', level=2)),                                # Ebene übersprungen
    plan(task('m', type='milestone', durationDays=0), task('c', 1)),    # Meilenstein mit Unterpunkt
    plan(task('a', name='')),                                           # leerer Name
    plan(task('a', name='x' * 121)),
    plan(task('a', start='2026-02-30')),                                # ungültiges Datum
    plan(task('a', durationDays=0)),                                    # Vorgang ohne Dauer
    plan(task('m', type='milestone', durationDays=2)),
    plan(task('a', percent=101)),
    plan(task('a', percent=True)),
    plan(task('a', note='x' * 501)),
    plan(task('a', type='summary')),
    plan(task('a', links=[link('zzz')])),                               # unbekannter Vorgänger
    plan(task('a', links=[link('a')])),                                 # eigener Vorgänger
    plan(task('a'), task('b', links=[link('a'), link('a', 'SS')])),     # doppelt verknüpft
    plan(task('a'), task('b', links=[link('a', 'XX')])),
    plan(task('a'), task('b', links=[link('a', lag=366)])),
    plan(task('a', links=[link('b')]), task('b', links=[link('a')])),   # Zirkelbezug
    plan(task('p'), task('k', 1, links=[link('p')])),                   # Unterpunkt mit eigenem Sammelvorgang
    plan(task('p', links=[link('x')]), task('k', 1), task('x')),        # Sammelvorgang mit Vorgänger
    plan(task('a'), project='anderes'),
])
def test_invalid_plans_are_rejected(bad):
    with pytest.raises(ValueError):
        validate_gantt(bad, 'p1')


def test_limits():
    with pytest.raises(ValueError):
        validate_gantt(plan(*[task(f't{i}') for i in range(501)]), 'p1')
    many = [task(f's{i}') for i in range(11)]
    many.append(task('z', links=[link(f's{i}') for i in range(11)]))
    with pytest.raises(ValueError):
        validate_gantt(plan(*many), 'p1')


def test_deep_outline_limit():
    tasks = [task(f'l{i}', level=i) for i in range(6)]
    validate_gantt(plan(*tasks), 'p1')
    tasks.append(task('l6', level=6))
    with pytest.raises(ValueError):
        validate_gantt(plan(*tasks), 'p1')


class FakeCollection:
    def __init__(self):
        self.docs = {}

    @staticmethod
    def _match(doc, query):
        for key, wanted in query.items():
            value = doc.get(key)
            if isinstance(wanted, dict):
                if '$gt' in wanted and not (value is not None and value > wanted['$gt']):
                    return False
            elif value != wanted:
                return False
        return True

    def find_one(self, query, projection=None):
        return next((deepcopy(doc) for doc in self.docs.values() if self._match(doc, query)), None)

    def insert_one(self, doc):
        doc.setdefault('_id', f'auto-{len(self.docs)}')
        if doc['_id'] in self.docs:
            raise DuplicateKeyError('duplicate')
        self.docs[doc['_id']] = deepcopy(doc)

    def delete_one(self, query):
        for key, doc in list(self.docs.items()):
            if self._match(doc, query):
                del self.docs[key]
                return

    @staticmethod
    def _apply(doc, update):
        for key, value in update.get('$set', {}).items():
            doc[key] = deepcopy(value)
        for key, value in update.get('$inc', {}).items():
            doc[key] = doc.get(key, 0) + value
        for key, spec in update.get('$push', {}).items():
            doc.setdefault(key, []).extend(deepcopy(spec['$each']))
            doc[key] = doc[key][spec['$slice']:]

    def update_one(self, query, update):
        for doc in self.docs.values():
            if self._match(doc, query):
                self._apply(doc, update)
                return type('Result', (), {'matched_count': 1})()
        return type('Result', (), {'matched_count': 0})()

    def find_one_and_update(self, query, update, upsert=False, return_document=ReturnDocument.BEFORE):
        for doc in self.docs.values():
            if self._match(doc, query):
                self._apply(doc, update)
                return deepcopy(doc)
        if not upsert:
            return None
        doc = {key: value for key, value in query.items() if not isinstance(value, dict)}
        if doc['_id'] in self.docs:
            raise DuplicateKeyError('duplicate')
        self._apply(doc, update)
        self.docs[doc['_id']] = doc
        return deepcopy(doc)


class FakeDatabase:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        return self.collections.setdefault(name, FakeCollection())


def login(client, username, password):
    page = client.get('/login')
    csrf = re.search(r'name="csrf" value="([^"]+)"', page.get_data(as_text=True)).group(1)
    return client.post('/login', data={'username': username, 'password': password, 'csrf': csrf})


@pytest.fixture
def server(monkeypatch):
    monkeypatch.setenv('KAPA_MODE', 'server')
    monkeypatch.setenv('APP_ENV', 'local')
    monkeypatch.setenv('PLATFORM_AUTH_MODE', 'off')
    monkeypatch.setenv('APP_SECRET_KEY', 'unit-test-secret-' + 'x' * 40)
    monkeypatch.setenv('KAPA_SERVER_TRANSPORT', 'http-internal')
    monkeypatch.setenv('KAPA_TRUSTED_HOSTS', 'localhost,127.0.0.1')
    monkeypatch.setenv('TRUSTED_PROXY_HOPS', '0')
    monkeypatch.setenv('KAPA_RATE_LIMIT_LOGIN_PER_MINUTE', '1000')
    store = ServerStore(FakeDatabase(), 'kapa_test_')
    store.create_user('admin', hash_password('correct-password-123'), 'admin')
    store.create_user('planer', hash_password('planer-password-123'), 'pl')
    store.create_user('qvp', hash_password('qvp-password-1234'), 'qvp')
    store.create_user('homeoffice', hash_password('ho-password-12345'), 'ho_pm')
    store.create_user('reader', hash_password('reader-password-123'), 'reader')
    store.save_planning({'version': 2, '_revision': 0, 'roles': [{'id': 'r', 'name': 'R'}], 'people': [],
                         'projects': [{'id': 'p1', 'name': 'Projekt 1'}]})
    app = create_app(server_repository=store)
    app.config.update(TESTING=True)
    return app, store


def session_client(app, username='admin', password='correct-password-123'):
    client = app.test_client()
    assert login(client, username, password).status_code == 302
    with client.session_transaction() as session:
        token = session['csrf']
    return client, {'X-Kapa-Token': token}


def test_admin_reads_and_saves_with_revision_conflict(server):
    app, store = server
    client, headers = session_client(app)
    assert client.get('/api/gantt/p1').get_json() == {'projectId': 'p1', 'tasks': [], '_revision': 0}
    body = plan(task('a'), task('b', links=[link('a')]))
    assert client.put('/api/gantt/p1', json=body).status_code == 403          # ohne Token
    assert client.put('/api/gantt/p1', json=body, headers=headers).get_json() == {'revision': 1}
    stale = client.put('/api/gantt/p1', json=body, headers=headers)            # Revision 0 ist veraltet
    assert stale.status_code == 409
    saved = client.get('/api/gantt/p1').get_json()
    assert saved['_revision'] == 1 and [item['id'] for item in saved['tasks']] == ['a', 'b']
    body['_revision'] = 1
    assert client.put('/api/gantt/p1', json=body, headers=headers).get_json() == {'revision': 2}
    assert store.read_planning().get('gantt') is None                           # nicht im allgemeinen Planungsdokument


def test_invalid_plan_unknown_project_and_bad_ids(server):
    app, _ = server
    client, headers = session_client(app)
    cyclic = plan(task('a', links=[link('b')]), task('b', links=[link('a')]))
    response = client.put('/api/gantt/p1', json=cyclic, headers=headers)
    assert response.status_code == 400 and 'Zirkel' in response.get_json()['error']
    assert client.put('/api/gantt/p1', data='kein json', headers=headers).status_code == 400
    assert client.get('/api/gantt/unbekannt').status_code == 404
    assert client.get('/api/gantt/a%20b').status_code == 404


def test_non_admins_are_denied_everywhere(server):
    app, _ = server
    for name, password in (('planer', 'planer-password-123'), ('qvp', 'qvp-password-1234'), ('reader', 'reader-password-123')):
        client, headers = session_client(app, name, password)
        assert client.get('/api/gantt/p1').status_code == 403
        assert client.put('/api/gantt/p1', json=plan(task('a')), headers=headers).status_code == 403
        html = client.get('/').get_data(as_text=True)
        assert 'Projektplan' not in html and 'gantt' not in html
    assert app.test_client().get('/api/gantt/p1').status_code == 401


def test_ho_pm_has_access_like_admin(server):
    app, _ = server
    client, headers = session_client(app, 'homeoffice', 'ho-password-12345')
    assert client.get('/api/gantt/p1').status_code == 200
    assert client.put('/api/gantt/p1', json=plan(task('a')), headers=headers).get_json() == {'revision': 1}
    html = client.get('/').get_data(as_text=True)
    assert 'Projektplan' in html and 'app/gantt.js' in html and 'data-gantt-url=' in html


def test_baseline_roundtrip_and_validation(server):
    app, _ = server
    client, headers = session_client(app)
    baseline = {'savedAt': '2026-05-10', 'tasks': {'a': {'start': '2026-05-04', 'end': '2026-05-08'}}}
    body = plan(task('a'))
    body['baseline'] = baseline
    assert client.put('/api/gantt/p1', json=body, headers=headers).get_json() == {'revision': 1}
    assert client.get('/api/gantt/p1').get_json()['baseline'] == baseline
    for bad in ({'savedAt': 'gestern', 'tasks': {}}, {'savedAt': '2026-05-10'}, {'savedAt': '2026-05-10', 'tasks': []},
                {'savedAt': '2026-05-10', 'tasks': {'a b': {'start': '2026-05-04', 'end': '2026-05-08'}}},
                {'savedAt': '2026-05-10', 'tasks': {'a': {'start': '2026-05-09', 'end': '2026-05-08'}}},
                {'savedAt': '2026-05-10', 'tasks': {'a': {'start': '2026-05-04'}}},
                {'savedAt': '2026-05-10', 'tasks': {f't{i}': {'start': '2026-05-04', 'end': '2026-05-08'} for i in range(501)}}):
        with pytest.raises(ValueError):
            validate_gantt({**plan(task('a')), 'baseline': bad}, 'p1')
    validate_gantt(plan(task('a')), 'p1')  # ohne Basisplan weiterhin gültig


def test_navigation_and_scripts_only_for_admin(server):
    app, _ = server
    client, _ = session_client(app)
    html = client.get('/').get_data(as_text=True)
    assert 'Projektplan' in html and '#gantt' in html and '#pt-icon-planner' in html
    assert 'app/gantt.js' in html and 'app/gantt-view.js' in html and 'data-gantt-url=' in html


def test_local_mode_has_no_project_plan(client):
    assert client.get('/api/gantt/p1').status_code == 404
    html = client.get('/').get_data(as_text=True)
    assert 'Projektplan' not in html and 'gantt' not in html


def test_phase_and_hours_are_accepted():
    validate_gantt(plan(task('g3', phase=0, hours=0), task('a', 1, hours=40), task('b', 1, hours=1000000),
                        task('g5', phase=1), task('m', 1, type='milestone', durationDays=0)), 'p1')


@pytest.mark.parametrize('bad', [
    plan(task('a', hours=-1)),
    plan(task('a', hours=1000001)),
    plan(task('a', hours=1.5)),
    plan(task('a', hours=True)),
    plan(task('a', hours='5')),
    plan(task('m', type='milestone', durationDays=0, hours=3)),         # Meilensteine haben keine Stunden
    plan(task('a', phase=4)),
    plan(task('a', phase=-1)),
    plan(task('a', phase=True)),
    plan(task('a', phase='0')),
    plan(task('a'), task('b', 1, phase=0)),                             # Phasenvorgang nicht auf oberster Ebene
    plan(task('a', phase=1), task('b', phase=1)),                       # Phase doppelt
    plan(task('a', phase=2), task('b', phase=1)),                       # falsche Reihenfolge
])
def test_invalid_phases_and_hours_are_rejected(bad):
    with pytest.raises(ValueError):
        validate_gantt(bad, 'p1')

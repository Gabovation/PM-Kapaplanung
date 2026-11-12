import re
import uuid
from pathlib import Path

import mongomock
import pytest
from pymongo.errors import OperationFailure

from kapa_planung.repositories.server_store import RevisionConflict, ServerStore
from kapa_planung.services.server_auth import hash_password
from kapa_planung.web import create_app
from tools.import_local_planning import import_empty


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
    db = mongomock.MongoClient().get_database('test_only')
    store = ServerStore(db, 'kapa_test_')
    store.create_user('admin', hash_password('correct-password-123'), 'admin')
    store.create_user('reader', hash_password('reader-password-123'), 'reader')
    app = create_app(server_repository=store)
    app.config.update(TESTING=True)
    return app, store, db


def login(client, username='admin', password='correct-password-123'):
    page = client.get('/login')
    csrf = re.search(r'name="csrf" value="([^"]+)"', page.get_data(as_text=True)).group(1)
    return client.post('/login', data={'username': username, 'password': password, 'csrf': csrf})


def snapshot():
    return {'version': 2, '_revision': 0, 'roles': [{'id': 'project-manager', 'name': 'Projektleiter'}], 'people': [], 'projects': []}


def test_anonymous_login_csrf_and_bad_host(server):
    app, _, _ = server
    client = app.test_client()
    assert client.get('/').status_code == 302
    assert client.get('/api/data').status_code == 401
    assert client.get('/health').status_code == 200
    assert client.get('/health', headers={'Host': 'untrusted.invalid'}).status_code == 400
    assert client.post('/login', data={'username': 'admin', 'password': 'correct-password-123'}).status_code == 403
    assert login(client, password='wrong-password').status_code == 401
    assert login(client).status_code == 302
    assert client.get('/').status_code == 200


def test_authenticated_save_csrf_revision_and_isolated_collections(server):
    app, store, db = server
    first = app.test_client()
    second = app.test_client()
    assert login(first).status_code == 302
    assert login(second).status_code == 302
    with first.session_transaction() as session:
        token1 = session['csrf']
    with second.session_transaction() as session:
        token2 = session['csrf']
    assert token1 != token2
    assert first.post('/api/data', json=snapshot()).status_code == 403
    assert first.post('/api/data', json=snapshot(), headers={'X-Kapa-Token': token2}).status_code == 403
    assert first.post('/api/data', json=snapshot(), headers={'X-Kapa-Token': token1}).get_json() == {'revision': 1}
    assert second.post('/api/data', json=snapshot(), headers={'X-Kapa-Token': token2}).status_code == 409
    assert first.get('/api/data').get_json()['_revision'] == 1
    assert set(db.list_collection_names()) == {'kapa_test_users', 'kapa_test_sessions', 'kapa_test_planning', 'kapa_test_audit'}
    assert store.read_planning()['_revision'] == 1


def test_reader_cannot_write_or_administer(server):
    app, _, _ = server
    client = app.test_client()
    assert login(client, 'reader', 'reader-password-123').status_code == 302
    assert client.get('/api/data').status_code == 200
    assert client.post('/api/data', json=snapshot()).status_code == 403
    assert client.get('/admin/users').status_code == 403


def test_reader_can_change_password_and_old_sessions_are_revoked(server):
    app, _, _ = server
    first, second = app.test_client(), app.test_client()
    assert login(first, 'reader', 'reader-password-123').status_code == 302
    assert login(second, 'reader', 'reader-password-123').status_code == 302
    assert first.get('/account/password').status_code == 200
    assert first.post('/account/password', data={}).status_code == 403
    with first.session_transaction() as session:
        token = session['csrf']
    form = {'csrf': token, 'current_password': 'wrong', 'new_password': 'reader-new-password-123'}
    assert first.post('/account/password', data=form).status_code == 200
    form['current_password'] = 'reader-password-123'
    assert first.post('/account/password', data=form).status_code == 302
    assert second.get('/api/data').status_code == 401
    assert login(first, 'reader', 'reader-password-123').status_code == 401
    assert login(first, 'reader', 'reader-new-password-123').status_code == 302


def test_logout_revokes_server_side_session_and_admin_reset_invalidates(server):
    app, store, _ = server
    client = app.test_client()
    assert login(client).status_code == 302
    with client.session_transaction() as session:
        token = session['csrf']
        sid = session['sid']
    assert store.find_session(sid)
    assert client.post('/logout', data={'csrf': token}).status_code == 302
    assert store.find_session(sid) is None
    assert client.get('/api/data').status_code == 401
    assert login(client).status_code == 302
    assert store.set_password('admin', hash_password('new-password-456'))
    assert client.get('/api/data').status_code == 401


def test_admin_can_create_account_only_with_csrf(server):
    app, store, _ = server
    client = app.test_client()
    assert login(client).status_code == 302
    assert client.get('/admin/users').status_code == 200
    payload = {'action': 'create', 'username': 'new.user', 'password': 'new-password-123', 'role': 'editor'}
    assert client.post('/admin/users', data=payload).status_code == 403
    with client.session_transaction() as session:
        payload['csrf'] = session['csrf']
    assert client.post('/admin/users', data=payload).status_code == 302
    assert store.find_user('new.user')['role'] == 'editor'
    assert client.post('/admin/users', data={'action': 'toggle', 'username': 'reader', 'active': '0', 'csrf': payload['csrf']}).status_code == 302
    assert store.find_user('reader')['active'] is False
    assert client.post('/admin/users', data={'action': 'toggle', 'username': 'admin', 'active': '0', 'csrf': payload['csrf']}).status_code == 200
    assert store.find_user('admin')['active'] is True


def test_atomic_conflict_and_prefix_are_checked():
    db = mongomock.MongoClient().get_database('test_only')
    with pytest.raises(ValueError):
        ServerStore(db, 'users')
    store = ServerStore(db, 'kapa_test_')
    assert store.save_planning(snapshot()) == 1
    with pytest.raises(RevisionConflict):
        store.save_planning(snapshot())


def test_invalid_server_configuration_fails_closed(server, monkeypatch):
    _, store, _ = server
    monkeypatch.setenv('APP_SECRET_KEY', '')
    with pytest.raises(RuntimeError):
        create_app(server_repository=store)
    monkeypatch.setenv('APP_SECRET_KEY', 'x' * 40)
    monkeypatch.setenv('KAPA_TRUSTED_HOSTS', '')
    with pytest.raises(RuntimeError):
        create_app(server_repository=store)


def test_readiness_never_creates_collections_and_indexes_are_explicit():
    db = mongomock.MongoClient().get_database('test_only')
    store = ServerStore(db, 'kapa_test_')
    assert store.ping()
    assert db.list_collection_names() == []
    store.initialize_indexes()
    assert db.list_collection_names() == ['kapa_test_sessions']


def test_database_error_does_not_leak_credentials(server, monkeypatch, caplog):
    app, store, _ = server
    def fail(_username):
        raise OperationFailure('mongodb://user:fake-secret@example.invalid')
    monkeypatch.setattr(store, 'find_user', fail)
    response = login(app.test_client())
    assert response.status_code == 503
    assert b'fake-secret' not in response.data
    assert 'fake-secret' not in caplog.text


def test_cookie_security_and_direct_http_proxy_rejected(server, monkeypatch):
    app, store, _ = server
    assert app.config['SESSION_COOKIE_HTTPONLY'] is True
    assert app.config['SESSION_COOKIE_SAMESITE'] == 'Lax'
    assert app.config['SESSION_COOKIE_SECURE'] is False
    monkeypatch.setenv('TRUSTED_PROXY_HOPS', '1')
    with pytest.raises(RuntimeError):
        create_app(server_repository=store)


def test_import_is_backup_first_and_never_overwrites_existing_server_data():
    db = mongomock.MongoClient().get_database('test_only')
    store = ServerStore(db, 'kapa_test_')
    backup = Path(__file__).resolve().parents[1] / ('test-import-backup-' + uuid.uuid4().hex + '.json')
    other = backup.with_name('test-import-backup-' + uuid.uuid4().hex + '.json')
    raw = b'{"fake": "backup"}'
    try:
        assert import_empty(store, raw, snapshot(), backup) == 1
        assert backup.read_bytes() == raw
        with pytest.raises(RevisionConflict):
            import_empty(store, raw, snapshot(), other)
        assert not other.exists()
        assert store.read_planning()['_revision'] == 1
    finally:
        backup.unlink(missing_ok=True)
        other.unlink(missing_ok=True)

"""Local-only demonstrator using the shared platform kit and UI shell."""
from __future__ import annotations

import hmac
import json
import os
import secrets
import tempfile
import threading
import time
from pathlib import Path

from flask import Flask, abort, jsonify, render_template, request, session
from kapa_planung import PROJECT_ROOT
from kapa_planung.ops_platform import init_platform
from kapa_planung.ops_platform.auth import require_permission
from kapa_planung.ops_platform.rate_limiter import rate_limit
from kapa_planung.services.roles import prepare_snapshot, validate_roles
from kapa_planung.services.planning import validate_assignments, validate_hour_plans

TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
DATA = PROJECT_ROOT / 'planung.json'

def create_app(*, server_repository=None) -> Flask:
    mode = os.getenv('KAPA_MODE', 'local').strip().lower()
    if mode not in ('local', 'server') or os.getenv('PLATFORM_AUTH_MODE', 'off').lower() != 'off':
        raise RuntimeError('Ungültiger Betriebsmodus oder nicht unterstützter Plattform-Anmeldemodus.')
    if mode == 'local' and os.getenv('APP_ENV', 'local').lower() != 'local':
        raise RuntimeError('Der lokale Modus unterstützt ausschließlich APP_ENV=local.')
    if mode == 'local' and os.getenv('APP_HOST', '127.0.0.1').strip().lower() not in ('', '127.0.0.1', 'localhost', '::1'):
        raise RuntimeError('Der lokale Modus darf nur an Loopback gebunden werden.')
    if mode == 'server':
        from kapa_planung.ops_platform.config import PLACEHOLDER_MARKERS
        secret = os.getenv('APP_SECRET_KEY', '').strip()
        transport = os.getenv('KAPA_SERVER_TRANSPORT', '').strip().lower()
        hosts = [h.strip() for h in os.getenv('KAPA_TRUSTED_HOSTS', '').split(',') if h.strip()]
        if len(secret) < 32 or any(marker in secret for marker in PLACEHOLDER_MARKERS) or transport not in ('https', 'http-internal') or not hosts:
            raise RuntimeError('Serverbetrieb benötigt APP_SECRET_KEY, KAPA_SERVER_TRANSPORT und KAPA_TRUSTED_HOSTS.')
        if transport == 'http-internal' and os.getenv('TRUSTED_PROXY_HOPS', '') != '0':
            raise RuntimeError('Direkter HTTP-Betrieb benötigt TRUSTED_PROXY_HOPS=0.')
        if transport == 'https' and os.getenv('TRUSTED_PROXY_HOPS', '') != '0':
            raise RuntimeError('HTTPS mit vorgeschaltetem Proxy ist noch nicht eingerichtet. Bitte den Proxy vor der Freigabe abstimmen.')
    app = Flask(__name__, template_folder=str(PROJECT_ROOT / 'templates'), static_folder=str(PROJECT_ROOT / 'static'))
    app.config.update(OPS_HELP_LAYOUT='layout.html', MAX_CONTENT_LENGTH=5_000_000, TEMPLATES_AUTO_RELOAD=True)
    # A BOM in a child template otherwise becomes body text before the doctype.
    # That switches browsers into quirks mode and adds an anonymous shell-grid item.
    app.jinja_loader.encoding = 'utf-8-sig'
    platform = init_platform(app, PROJECT_ROOT, use_mongo=False)
    app.jinja_env.globals['server_auth_enabled'] = mode == 'server'
    store = None
    if mode == 'server':
        from pymongo.errors import PyMongoError
        from kapa_planung.repositories.server_store import ServerStore
        from kapa_planung.services.server_auth import init_server_auth

        app.config.update(TRUSTED_HOSTS=hosts, SESSION_COOKIE_SECURE=(transport == 'https'))
        try:
            store = server_repository or ServerStore.from_environment()
        except (ValueError, PyMongoError, OSError):
            raise RuntimeError('Die MongoDB-Konfiguration konnte nicht geladen werden.') from None
        app.extensions['kapa_server_store'] = store
        platform.health.add_check('database', store.ping, critical=True)

        @app.before_request
        def require_secure_transport():
            if transport == 'https' and not request.is_secure and request.endpoint != 'ops_health.health':
                abort(400)

        init_server_auth(app, store)

        @app.errorhandler(PyMongoError)
        def database_error(exc):
            app.logger.error('MongoDB-Zugriff fehlgeschlagen (%s).', type(exc).__name__)
            return jsonify(error='Die Datenbank ist derzeit nicht erreichbar.'), 503

        @app.after_request
        def server_no_store(response):
            endpoint = request.endpoint or ''
            if endpoint != 'static' and not endpoint.endswith('.static'):
                response.headers['Cache-Control'] = 'private, no-store'
            return response

    @app.get('/')
    @require_permission('kapa-planung.viewer')
    def index():
        if not platform.ui_kit_enabled:
            abort(503)
        response = app.make_response(render_template('index.html', active_nav='overview', write_token=session['csrf'] if mode == 'server' else TOKEN,
                            gantt_enabled=mode == 'server' and session.get('role') == 'admin'))
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.route('/api/data', methods=['GET', 'POST'])
    @require_permission('kapa-planung.editor')
    @rate_limit('planning-data', env='RATE_LIMIT_WRITE_PER_MINUTE', default=120)
    def planning_data():
        with LOCK:
            try:
                current = store.read_planning() if store is not None else (json.loads(DATA.read_text(encoding='utf-8')) if DATA.exists() else None)
            except (OSError, json.JSONDecodeError):
                return jsonify(error='Die Datendatei kann nicht gelesen werden.'), 500
            if request.method == 'GET':
                return jsonify(current)
            supplied = request.headers.get('X-Kapa-Token', '')
            expected = session.get('csrf', '') if mode == 'server' else TOKEN
            if not supplied or not expected or not hmac.compare_digest(supplied, expected):
                abort(403)
            incoming = request.get_json(silent=True)
            if not isinstance(incoming, dict) or incoming.get('version') != 2 or not isinstance(incoming.get('people'), list) or not isinstance(incoming.get('projects'), list):
                return jsonify(error='Ungültige Planungsdaten.'), 400
            try:
                validate_roles(incoming)
                validate_assignments(incoming)
                validate_hour_plans(incoming)
                from kapa_planung.services.sap_import import validate_actuals
                validate_actuals(incoming)
            except ValueError as exc:
                return jsonify(error=str(exc)), 400
            revision = current.get('_revision', 0) if current else 0
            if incoming.get('_revision', 0) != revision:
                return jsonify(error='Die Planung wurde in einem anderen Fenster geändert. Bitte neu laden.'), 409
            if store is not None:
                from kapa_planung.repositories.server_store import RevisionConflict
                try:
                    return jsonify(revision=store.save_planning(incoming, actor=session['username']))
                except RevisionConflict:
                    return jsonify(error='Die Planung wurde in einem anderen Fenster geändert. Bitte neu laden.'), 409
            incoming['_revision'] = revision + 1
            name = None
            try:
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=DATA.parent, delete=False) as tmp:
                    name = tmp.name
                    json.dump(incoming, tmp, ensure_ascii=False)
                # Bounded retries tolerate transient Windows file locks; persistent errors still fail.
                for attempt in range(3):
                    try:
                        os.replace(name, DATA)
                        break
                    except PermissionError:
                        if attempt == 2:
                            raise
                        time.sleep(0.025)
            except OSError:
                return jsonify(error='Die Planung konnte nicht gespeichert werden.'), 500
            finally:
                if name:
                    try:
                        Path(name).unlink(missing_ok=True)
                    except OSError:
                        app.logger.warning('Temporary planning file could not be removed.')
            return jsonify(revision=incoming['_revision'])

    @app.route('/api/gantt/<project_id>', methods=['GET', 'PUT'])
    @require_permission('kapa-planung.editor')
    @rate_limit('gantt-data', env='RATE_LIMIT_WRITE_PER_MINUTE', default=240)
    def gantt_data(project_id):
        # Der Terminplan ist vorerst nur für Administratoren da und existiert nur im Serverbetrieb.
        if store is None:
            abort(404)
        if session.get('role') != 'admin':
            abort(403)
        from kapa_planung.services.gantt import valid_project_id, validate_gantt
        planning = store.read_planning() or {}
        if not valid_project_id(project_id) or not any(isinstance(item, dict) and item.get('id') == project_id for item in planning.get('projects', [])):
            return jsonify(error='Dieses Projekt existiert nicht.'), 404
        if request.method == 'GET':
            return jsonify(store.read_gantt(project_id))
        supplied = request.headers.get('X-Kapa-Token', '')
        expected = session.get('csrf', '')
        if not supplied or not expected or not hmac.compare_digest(supplied, expected):
            abort(403)
        incoming = request.get_json(silent=True)
        try:
            validate_gantt(incoming, project_id)
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        from kapa_planung.repositories.server_store import RevisionConflict
        try:
            return jsonify(revision=store.save_gantt(project_id, incoming, actor=session['username']))
        except RevisionConflict:
            return jsonify(error='Der Projektplan wurde in einem anderen Fenster geändert. Bitte neu laden.'), 409
        except ValueError as exc:
            return jsonify(error=str(exc)), 400

    @app.post('/api/sap-preview')
    @require_permission('kapa-planung.editor')
    @rate_limit('sap-import', env='RATE_LIMIT_WRITE_PER_MINUTE', default=30)
    def sap_preview():
        supplied = request.headers.get('X-Kapa-Token', '')
        expected = session.get('csrf', '') if mode == 'server' else TOKEN
        if not supplied or not expected or not hmac.compare_digest(supplied, expected):
            abort(403)
        file = request.files.get('file')
        if file is None or not file.filename.lower().endswith('.xlsx'):
            return jsonify(error='Bitte eine XLSX-Datei ausw?hlen.'), 400
        from kapa_planung.services.sap_import import read_export
        try:
            rows = read_export(file.read())
            from kapa_planung.services.sap_import import validate_actuals
            validate_actuals({'sapActuals': rows})
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        except Exception as exc:
            app.logger.warning('Ung?ltiger SAP-Export (%s).', type(exc).__name__)
            return jsonify(error='Die Excel-Datei konnte nicht sicher gelesen werden.'), 400
        return jsonify(rows=rows)

    @app.post('/api/prepare-import')
    @require_permission('kapa-planung.editor')
    @rate_limit('planning-import', env='RATE_LIMIT_WRITE_PER_MINUTE', default=120)
    def prepare_import():
        supplied = request.headers.get('X-Kapa-Token', '')
        expected = session.get('csrf', '') if mode == 'server' else TOKEN
        if not supplied or not expected or not hmac.compare_digest(supplied, expected):
            abort(403)
        try:
            snapshot = prepare_snapshot(request.get_json(silent=True))
            validate_assignments(snapshot)
            validate_hour_plans(snapshot)
            from kapa_planung.services.sap_import import validate_actuals
            validate_actuals(snapshot)
        except (ValueError, TypeError) as exc:
            return jsonify(error=str(exc)), 400
        # Preparing an import is read-only; the normal write still compares the revision.
        return jsonify(snapshot)
    return app

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

from flask import Flask, abort, jsonify, render_template, request
from kapa_planung import PROJECT_ROOT
from kapa_planung.ops_platform import init_platform
from kapa_planung.ops_platform.auth import require_permission
from kapa_planung.ops_platform.rate_limiter import rate_limit
from kapa_planung.services.roles import prepare_snapshot, validate_roles
from kapa_planung.services.planning import validate_assignments, validate_hour_plans

TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()
DATA = PROJECT_ROOT / 'planung.json'

def create_app() -> Flask:
    if os.getenv('APP_ENV', 'local').lower() != 'local' or os.getenv('PLATFORM_AUTH_MODE', 'off').lower() != 'off':
        raise RuntimeError('Dieser Prototyp unterstützt ausschließlich den lokalen Einzelbenutzerbetrieb.')
    app = Flask(__name__, template_folder=str(PROJECT_ROOT / 'templates'), static_folder=str(PROJECT_ROOT / 'static'))
    app.config.update(OPS_HELP_LAYOUT='layout.html', MAX_CONTENT_LENGTH=5_000_000, TEMPLATES_AUTO_RELOAD=True)
    # A BOM in a child template otherwise becomes body text before the doctype.
    # That switches browsers into quirks mode and adds an anonymous shell-grid item.
    app.jinja_loader.encoding = 'utf-8-sig'
    platform = init_platform(app, PROJECT_ROOT, use_mongo=False)

    @app.get('/')
    @require_permission('kapa-planung.viewer')
    def index():
        if not platform.ui_kit_enabled:
            abort(503)
        response = app.make_response(render_template('index.html', active_nav='overview', write_token=TOKEN))
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.route('/api/data', methods=['GET', 'POST'])
    @require_permission('kapa-planung.editor')
    @rate_limit('planning-data', env='RATE_LIMIT_WRITE_PER_MINUTE', default=120)
    def planning_data():
        with LOCK:
            try:
                current = json.loads(DATA.read_text(encoding='utf-8')) if DATA.exists() else None
            except (OSError, json.JSONDecodeError):
                return jsonify(error='Die Datendatei kann nicht gelesen werden.'), 500
            if request.method == 'GET':
                return jsonify(current)
            if not hmac.compare_digest(request.headers.get('X-Kapa-Token', ''), TOKEN):
                abort(403)
            incoming = request.get_json(silent=True)
            if not isinstance(incoming, dict) or incoming.get('version') != 2 or not isinstance(incoming.get('people'), list) or not isinstance(incoming.get('projects'), list):
                return jsonify(error='Ungültige Planungsdaten.'), 400
            try:
                validate_roles(incoming)
                validate_assignments(incoming)
                validate_hour_plans(incoming)
            except ValueError as exc:
                return jsonify(error=str(exc)), 400
            revision = current.get('_revision', 0) if current else 0
            if incoming.get('_revision', 0) != revision:
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

    @app.post('/api/prepare-import')
    @require_permission('kapa-planung.editor')
    @rate_limit('planning-import', env='RATE_LIMIT_WRITE_PER_MINUTE', default=120)
    def prepare_import():
        if not hmac.compare_digest(request.headers.get('X-Kapa-Token', ''), TOKEN):
            abort(403)
        try:
            snapshot = prepare_snapshot(request.get_json(silent=True))
            validate_assignments(snapshot)
            validate_hour_plans(snapshot)
        except (ValueError, TypeError) as exc:
            return jsonify(error=str(exc)), 400
        # Preparing an import is read-only; the normal write still compares the revision.
        return jsonify(snapshot)
    return app

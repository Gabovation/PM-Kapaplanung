"""Eigenständige Konten für den ausdrücklich gewählten Serverbetrieb."""
from __future__ import annotations

from datetime import timedelta
import hmac
import re
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from flask import abort, jsonify, redirect, render_template, request, session, url_for
from pymongo.errors import DuplicateKeyError

from kapa_planung.ops_platform.rate_limiter import rate_limit

HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
ROLES = ('admin', 'pl', 'qvp', 'ho_pm', 'editor', 'reader')
ASSIGNABLE_ROLES = ('admin', 'pl', 'qvp', 'ho_pm')


def normalize_username(value):
    name = str(value).strip().casefold()
    if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{2,63}', name):
        raise ValueError('Der Benutzername muss 3 bis 64 Zeichen aus a–z, 0–9, Punkt, Unterstrich oder Bindestrich enthalten.')
    return name


def hash_password(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise ValueError('Das Passwort muss 12 bis 256 Zeichen enthalten.')
    return HASHER.hash(password)


def init_server_auth(app, store):
    app.config.update(PERMANENT_SESSION_LIFETIME=timedelta(hours=12))
    # Prevent account enumeration through a much cheaper nonexistent-user check.
    dummy_hash = HASHER.hash(secrets.token_urlsafe(32))

    @app.before_request
    def require_server_account():
        if request.routing_exception is not None:
            return None
        endpoint = request.endpoint or ''
        if endpoint in ('login', 'ops_health.health') or endpoint == 'static' or endpoint.endswith('.static'):
            return None
        current = store.find_session(session.get('sid'))
        username = current.get('username') if current else None
        user = store.find_user(username) if isinstance(username, str) else None
        if not user or not user.get('active') or user.get('session_version') != current.get('session_version') or user.get('role') not in ROLES:
            session.clear()
            if request.path.startswith('/api/'):
                return jsonify(error='Bitte anmelden.'), 401
            return redirect(url_for('login'))
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and user['role'] == 'reader' and endpoint not in ('logout', 'change_password'):
            return jsonify(error='Keine Berechtigung zum Ändern.'), 403
        if endpoint.startswith('admin_') and user['role'] != 'admin':
            abort(403)
        session['username'] = username
        session['role'] = user['role']
        return None

    @app.route('/login', methods=['GET', 'POST'])
    @rate_limit('kapa-login', env='KAPA_RATE_LIMIT_LOGIN_PER_MINUTE', default=10)
    def login():
        if request.method == 'POST':
            token = request.form.get('csrf', '')
            if not token or not hmac.compare_digest(token, session.get('login_csrf', '')):
                abort(403)
            raw_name = request.form.get('username', '')
            password = request.form.get('password', '')
            try:
                username = normalize_username(raw_name)
            except ValueError:
                username = ''
            user = store.find_user(username) if username else None
            candidate = user.get('password_hash', dummy_hash) if user else dummy_hash
            try:
                correct = len(password) <= 256 and HASHER.verify(candidate, password)
            except (VerificationError, InvalidHashError):
                correct = False
            if correct and user and user.get('active') and user.get('role') in ROLES:
                sid = store.create_session(username, user['session_version'])
                store.record_event('login.success', username)
                session.clear()
                session.permanent = True
                session.update(username=username, role=user['role'], sid=sid, csrf=secrets.token_urlsafe(32))
                return redirect(url_for('index'))
            store.record_event('login.denied', username or 'unbekannt')
            session['login_csrf'] = secrets.token_urlsafe(32)
            return render_template('login.html', csrf=session['login_csrf'], error='Anmeldung fehlgeschlagen.'), 401
        session['login_csrf'] = secrets.token_urlsafe(32)
        return render_template('login.html', csrf=session['login_csrf'], error=None)

    @app.post('/logout')
    def logout():
        token = request.form.get('csrf', '')
        if not token or not hmac.compare_digest(token, session.get('csrf', '')):
            abort(403)
        store.record_event('logout', session.get('username', 'unbekannt'))
        store.delete_session(session.get('sid'))
        session.clear()
        return redirect(url_for('login'))

    @app.route('/account/password', methods=['GET', 'POST'])
    @rate_limit('kapa-password', env='KAPA_RATE_LIMIT_PASSWORD_PER_MINUTE', default=10)
    def change_password():
        error = None
        if request.method == 'POST':
            token = request.form.get('csrf', '')
            if not token or not hmac.compare_digest(token, session.get('csrf', '')):
                abort(403)
            user = store.find_user(session['username'])
            current = request.form.get('current_password', '')
            try:
                correct = len(current) <= 256 and HASHER.verify(user['password_hash'], current)
            except (VerificationError, InvalidHashError):
                correct = False
            try:
                if not correct:
                    raise ValueError('Das bisherige Passwort ist nicht korrekt.')
                new_hash = hash_password(request.form.get('new_password', ''))
                if not store.change_password(session['username'], user['password_hash'], new_hash):
                    raise ValueError('Das Konto wurde zwischenzeitlich geändert. Bitte erneut anmelden.')
                store.record_event('account.password_changed', session['username'])
                store.delete_session(session.get('sid'))
                session.clear()
                return redirect(url_for('login'))
            except ValueError as exc:
                error = str(exc)
        return render_template('change_password.html', csrf=session.get('csrf', ''), error=error)

    @app.route('/admin/users', methods=['GET', 'POST'])
    @rate_limit('kapa-users', env='KAPA_RATE_LIMIT_USERS_PER_MINUTE', default=30)
    def admin_users():
        error = None
        if request.method == 'POST':
            token = request.form.get('csrf', '')
            if not token or not hmac.compare_digest(token, session.get('csrf', '')):
                abort(403)
            try:
                username = normalize_username(request.form.get('username', ''))
                action = request.form.get('action', '')
                if action in ('create', 'reset'):
                    password_hash = hash_password(request.form.get('password', ''))
                if action == 'create':
                    role = request.form.get('role', '')
                    if role not in ASSIGNABLE_ROLES:
                        raise ValueError('Bitte eine gültige Berechtigung auswählen.')
                    store.create_user(username, password_hash, role)
                elif action == 'role':
                    role = request.form.get('role', '')
                    if username == session.get('username'):
                        raise ValueError('Die eigene Administratorrolle kann nicht geändert werden.')
                    if role not in ASSIGNABLE_ROLES:
                        raise ValueError('Bitte eine gültige Rolle auswählen.')
                    if not store.set_role(username, role):
                        raise ValueError('Dieses Konto existiert nicht.')
                elif action == 'reset':
                    if not store.set_password(username, password_hash):
                        raise ValueError('Dieses Konto existiert nicht.')
                elif action == 'toggle':
                    if username == session.get('username'):
                        raise ValueError('Das eigene Konto kann nicht gesperrt werden.')
                    value = request.form.get('active')
                    if value not in ('0', '1') or not store.set_active(username, value == '1'):
                        raise ValueError('Dieses Konto existiert nicht.')
                else:
                    raise ValueError('Ungültige Aktion.')
                store.record_event('account.' + action, session['username'], username)
                return redirect(url_for('admin_users'))
            except DuplicateKeyError:
                error = 'Dieser Benutzername ist bereits vergeben.'
            except ValueError as exc:
                error = str(exc)
        return render_template('server_users.html', users=store.list_users(), csrf=session.get('csrf', ''), error=error, active_nav='users')

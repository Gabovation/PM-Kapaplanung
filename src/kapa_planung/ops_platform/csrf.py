"""Opt-in session-bound CSRF protection for browser write endpoints."""

from __future__ import annotations

import secrets

from flask import Flask, abort, request, session

_SESSION_KEY = "ops_csrf_token"
_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def csrf_token() -> str:
    token = session.get(_SESSION_KEY)
    if not isinstance(token, str) or not token:
        token = secrets.token_urlsafe(32)
        session[_SESSION_KEY] = token
    return token


def init_csrf(app: Flask) -> None:
    """Require the current session's token on all state-changing requests."""
    app.jinja_env.globals["csrf_token"] = csrf_token

    @app.before_request
    def validate_csrf() -> None:
        if request.method not in _UNSAFE_METHODS:
            return
        expected = session.get(_SESSION_KEY)
        supplied = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token")
        if (
            not isinstance(expected, str) or not expected.isascii()
            or not supplied or not supplied.isascii()
            or not secrets.compare_digest(expected, supplied)
        ):
            abort(400, description="Invalid or expired form token.")

"""Security headers, reverse-proxy trust and the per-app session cookie (SEC-01, PRX-01..03)."""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import Any

from flask import Flask, Request, g, request
from flask.sessions import SecureCookieSessionInterface
from werkzeug.middleware.proxy_fix import ProxyFix

SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}

SAME_ORIGIN_FRAME_ANCESTORS = "frame-ancestors 'self'"


def same_origin_embeddable(view: Callable[..., Any]) -> Callable[..., Any]:
    """Allow this route to be framed by pages of the same origin only (SEC-01, decision 0019).

    For widget pages that a board on the same platform host shows in an iframe. Every other
    route stays ``X-Frame-Options: DENY``. Permission checks are unchanged.
    """

    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        g.ops_same_origin_embeddable = True
        return view(*args, **kwargs)

    return wrapper


def apply_security_headers(app: Flask) -> None:
    @app.after_request
    def _security_headers(response):  # type: ignore[no-untyped-def]
        embeddable = bool(g.get("ops_same_origin_embeddable"))
        for header, value in SECURITY_HEADERS.items():
            if header == "X-Frame-Options" and embeddable:
                value = "SAMEORIGIN"
            response.headers.setdefault(header, value)
        if embeddable:
            policy = response.headers.get("Content-Security-Policy", "")
            if "frame-ancestors" not in policy:
                policy = f"{policy}; {SAME_ORIGIN_FRAME_ANCESTORS}" if policy else SAME_ORIGIN_FRAME_ANCESTORS
                response.headers["Content-Security-Policy"] = policy
        return response


def trust_reverse_proxy(app: Flask, hops: int) -> None:
    """Honour X-Forwarded-For/-Proto/-Host/-Prefix from exactly ``hops`` proxies.

    With the prefix header, ``url_for`` produces ``/processdata/...`` behind IIS/ARR and
    plain ``/...`` locally, without any code change. ``hops=0`` disables trust, which is
    required whenever Waitress is reachable without the proxy in front (PRX-02).
    """
    if hops > 0:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=hops, x_proto=hops, x_host=hops, x_prefix=hops)  # type: ignore[method-assign]


class PrefixAwareSessionInterface(SecureCookieSessionInterface):
    """Scope the session cookie to the path the app is served under (``/processdata/``)."""

    def get_cookie_path(self, app: Flask) -> str:
        configured = app.config.get("SESSION_COOKIE_PATH")
        if configured:
            return str(configured)
        return (request.script_root or "") + "/"


def configure_session_cookie(app: Flask, cookie_name: str, *, secure: bool) -> None:
    app.config.update(
        SESSION_COOKIE_NAME=cookie_name,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=secure,
    )
    app.session_interface = PrefixAwareSessionInterface()


def client_identity(req: Request | None = None) -> str:
    # remote_addr is already the real client once ProxyFix ran; reading X-Forwarded-For
    # directly would let any client choose its own rate-limit bucket (SEC-03).
    req = req or request
    return str(req.remote_addr or "unknown")

"""Platform contract tests every app keeps (QA-02). Extend, do not delete."""

from __future__ import annotations

from unittest.mock import patch

from kapa_planung.ops_platform import mongo
from kapa_planung.ops_platform.manifest import load_manifest
from kapa_planung.ops_platform.rate_limiter import InMemoryRateLimiter

from conftest import PROJECT_ROOT


def test_health_reports_ok_when_database_is_reachable(client):
    with patch.object(mongo, "ping", return_value=True):
        response = client.get("/health")
    body = response.get_json()
    assert response.status_code == 200
    assert body["ok"] is True
    assert body["appId"] == load_manifest(PROJECT_ROOT).app_id
    for field in ("version", "environment", "startedAt", "uptimeSeconds", "standardVersion", "designSystemVersion"):
        assert field in body


def test_health_returns_503_when_database_is_down(client, app):
    # The local prototype has no MongoDB; register the standard critical check
    # explicitly to retain coverage of the platform failure contract.
    app.extensions["ops_platform"].health.add_check("database", lambda: {"ok": mongo.ping()}, critical=True)
    with patch.object(mongo, "ping", return_value=False):
        response = client.get("/health")
    assert response.status_code == 503
    assert response.get_json()["checks"]["database"]["ok"] is False


def test_metrics_counts_requests(client):
    client.get("/does-not-exist")
    with patch.object(mongo, "database_stats", return_value=None):
        body = client.get("/health/metrics").get_json()
    assert body["requests"]["total"] >= 1
    assert body["requests"]["byStatus"]["4xx"] >= 1


def test_metrics_requires_token_when_configured(client, monkeypatch):
    monkeypatch.setenv("MONITORING_TOKEN", "secret")
    assert client.get("/health/metrics").status_code == 403
    with patch.object(mongo, "database_stats", return_value=None):
        assert client.get("/health/metrics", headers={"X-Monitoring-Token": "secret"}).status_code == 200


def test_security_headers_on_every_response(client):
    with patch.object(mongo, "ping", return_value=True):
        response = client.get("/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_proxy_prefix_is_honoured(app):
    @app.get("/_probe")
    def probe():  # type: ignore[no-untyped-def]
        from flask import session, url_for

        session["seen"] = True
        return url_for("index")

    manifest = load_manifest(PROJECT_ROOT)
    response = app.test_client().get(
        "/_probe", headers={"X-Forwarded-Prefix": manifest.path, "X-Forwarded-Proto": "https"}
    )
    assert response.get_data(as_text=True) == f"{manifest.path}/"
    cookie = response.headers["Set-Cookie"]
    assert cookie.startswith(f"{manifest.session_cookie_name}=")
    assert f"Path={manifest.path}/" in cookie


def test_rate_limiter_blocks_after_limit():
    limiter = InMemoryRateLimiter()
    for _ in range(3):
        assert limiter.allow("bucket", "client", limit=3).allowed
    result = limiter.allow("bucket", "client", limit=3)
    assert result.allowed is False and result.retry_after_seconds > 0


def test_language_follows_the_ops_lang_cookie(app):
    from kapa_planung.ops_platform.i18n import t

    with app.test_request_context("/", headers={"Cookie": "ops_lang=de"}):
        app.preprocess_request()
        assert t("Welcome to {name}", name="X") == "Willkommen bei X"
    with app.test_request_context("/", headers={"Accept-Language": "fr"}):
        app.preprocess_request()
        assert t("Welcome to {name}", name="X") == "Welcome to X"

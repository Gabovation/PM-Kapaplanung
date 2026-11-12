from __future__ import annotations

import sys
import os
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(PROJECT_ROOT / ".local_packages"), str(PROJECT_ROOT / "src")]

# The developer's user environment may contain real server credentials.
# Tests must never inherit them, even before the first app fixture is created.
for name in ('IMPEDANZROHR_MONGODB_URI', 'IMPEDANZROHR_MONGODB_DATABASE', 'IMPEDANZROHR_AUTH_SECRET',
             'MONGODB_URI', 'MONGODB_DATABASE', 'MONGODB_CA_FILE', 'APP_SECRET_KEY', 'KAPA_MODE',
             'KAPA_COLLECTION_PREFIX', 'KAPA_SERVER_TRANSPORT', 'KAPA_TRUSTED_HOSTS',
             'APP_HOST', 'PLATFORM_AUTH_MODE', 'TRUSTED_PROXY_HOPS'):
    os.environ.pop(name, None)


@pytest.fixture()
def app(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("MONGODB_URI", "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=50")
    from kapa_planung.web import create_app

    flask_app = create_app()
    flask_app.config.update(TESTING=True)
    return flask_app


@pytest.fixture()
def client(app):
    return app.test_client()

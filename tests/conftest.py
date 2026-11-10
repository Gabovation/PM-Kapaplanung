from __future__ import annotations

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(PROJECT_ROOT / ".local_packages"), str(PROJECT_ROOT / "src")]


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

"""Builds the process host shared by main.py and the Windows service."""

from __future__ import annotations

import os

from kapa_planung import PROJECT_ROOT
from kapa_planung.ops_platform import mongo
from kapa_planung.ops_platform.config import env_int
from kapa_planung.ops_platform.manifest import load_manifest
from kapa_planung.ops_platform.server_host import AppHost


def build_host() -> AppHost:
    from kapa_planung.web import create_app

    manifest = load_manifest(PROJECT_ROOT)
    app = create_app()
    return AppHost(
        app,
        host=os.getenv("APP_HOST", "127.0.0.1"),
        port=env_int("APP_PORT", manifest.default_port),
        threads=env_int("APP_THREADS", 8),
        workers=[],  # background workers: objects with name/start()/stop(), started before HTTP
        on_stopped=mongo.close,
    )

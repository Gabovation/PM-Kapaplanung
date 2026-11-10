"""One call that makes a Flask app platform-compliant: ``init_platform(app, project_root)``."""

from __future__ import annotations

import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from flask import Flask

from . import mongo
from .auth import init_auth
from .config import PLACEHOLDER_MARKERS, app_environment, env_flag, env_int
from .health import HealthRegistry, init_health
from .i18n import init_i18n
from .manifest import AppManifest, load_manifest
from .manual import init_manual
from .security import apply_security_headers, configure_session_cookie, trust_reverse_proxy
from .static_cache import init_static_cache
from .pwa import init_pwa
from .ui_kit import design_system_version, init_ui_kit
from .widgets import init_widgets

log = logging.getLogger("ops_platform")

_ENVIRONMENT_LABELS = {"local": ("LOCAL", "test"), "dev": ("DEV", "test"), "prd": ("ONLINE", "online")}


@dataclass
class Platform:
    manifest: AppManifest
    health: HealthRegistry
    ui_kit_enabled: bool

    def database(self):  # type: ignore[no-untyped-def]
        return mongo.get_database(self.manifest.database)


def init_platform(app: Flask, project_root: Path, *, use_mongo: bool = True) -> Platform:
    project_root = Path(project_root)
    manifest = load_manifest(project_root)
    environment = app_environment()

    secret = os.getenv("APP_SECRET_KEY", "").strip()
    if not secret or any(marker in secret for marker in PLACEHOLDER_MARKERS):
        if environment == "prd":
            raise RuntimeError("APP_SECRET_KEY is required when APP_ENV=prd")
        # Sessions reset on restart - acceptable locally, never in production.
        secret = secrets.token_hex(32)
        log.warning("APP_SECRET_KEY not set; using a per-process key (APP_ENV=%s)", environment)
    app.config["SECRET_KEY"] = secret

    trust_reverse_proxy(app, env_int("TRUSTED_PROXY_HOPS", 1))
    configure_session_cookie(
        app, manifest.session_cookie_name, secure=env_flag("APP_COOKIE_SECURE", environment != "local")
    )
    apply_security_headers(app)
    init_static_cache(app)
    init_auth(app, manifest)
    init_widgets(app, manifest)
    init_i18n(app, manifest.languages, project_root)

    registry = HealthRegistry(manifest, lambda: design_system_version(project_root))
    if use_mongo and manifest.database:
        mongo.DEFAULT_APP_NAME = manifest.app_id
        registry.add_check("database", lambda: {"ok": mongo.ping()}, critical=True)
        registry.database_stats = lambda: mongo.database_stats(manifest.database)
    init_health(app, registry)

    ui_enabled = init_ui_kit(app, project_root)
    if ui_enabled:
        init_manual(app, project_root, manifest)
        init_pwa(app, manifest)
    label, state = _ENVIRONMENT_LABELS.get(environment, (environment.upper(), "test"))
    app.jinja_env.globals.update(app_manifest=manifest, environment_label=label, environment_state=state)

    platform = Platform(manifest=manifest, health=registry, ui_kit_enabled=ui_enabled)
    app.extensions["ops_platform"] = platform
    return platform

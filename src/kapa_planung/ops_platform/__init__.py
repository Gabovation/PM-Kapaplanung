"""POLYTEC Operations Platform kit - shared runtime code for every platform app.

This package is copied verbatim into ``src/<package>/ops_platform/`` of each app by
``tools/sync_platform_kit.py`` in the gma-app-standards repository. Never edit
it inside an app: change it in the standards repository, then re-sync every app.
Standard rules: STR-05 (vendoring), MON-01..05 (health), SEC-01..06, PRX-01..05, REG-06 (proxy_rules), IAM-01..04,
DOC-05 (manual), REG-10 (widgets), REG-11 (printing).
"""

from __future__ import annotations

KIT_VERSION = "4.9.1"

from .app_factory import Platform, init_platform  # noqa: E402
from .manifest import AppManifest, load_manifest  # noqa: E402

__all__ = ["KIT_VERSION", "AppManifest", "Platform", "init_platform", "load_manifest"]

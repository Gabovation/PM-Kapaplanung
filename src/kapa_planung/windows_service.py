"""Windows service entry point. ``install.bat service`` registers it; do not rename this module.

It runs from this folder, so no module next to it may be named like a standard-library module (DEP-06).
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "src"))

from kapa_planung.ops_platform.config import load_project_env  # noqa: E402
from kapa_planung.ops_platform.manifest import load_manifest  # noqa: E402
from kapa_planung.ops_platform.windows_service import PlatformService, handle_command_line  # noqa: E402

MANIFEST = load_manifest(PROJECT_ROOT)


class AppService(PlatformService):
    _svc_name_ = MANIFEST.service_name
    _svc_display_name_ = f"POLYTEC {MANIFEST.name}"
    _svc_description_ = f"{MANIFEST.name} - POLYTEC Operations Platform ({MANIFEST.app_id})"
    project_root = PROJECT_ROOT

    def build_host(self):  # type: ignore[no-untyped-def]
        load_project_env(PROJECT_ROOT)
        from kapa_planung.host import build_host

        return build_host()


if __name__ == "__main__":
    handle_command_line(AppService)

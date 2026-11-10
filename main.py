"""Console entry point: ``start.bat`` without a registered service, and local development."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from kapa_planung.ops_platform.config import load_project_env  # noqa: E402
from kapa_planung.ops_platform.logging_setup import configure_logging  # noqa: E402
from kapa_planung.ops_platform.server_host import run_console  # noqa: E402


def main() -> int:
    load_project_env(PROJECT_ROOT)
    configure_logging(PROJECT_ROOT)
    from kapa_planung.host import build_host
    from kapa_planung.ops_platform.manifest import load_manifest

    return run_console(build_host, load_manifest(PROJECT_ROOT).name)


if __name__ == "__main__":
    sys.exit(main())

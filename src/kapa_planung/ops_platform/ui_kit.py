"""Flask wiring for the vendored POLYTEC UI Kit (UI-01..05).

The design-system files under ``static/polytec/`` and ``templates/{polytec_ui,ops_platform_ui}/``
are verbatim copies made by ``polytec-design-system/tools/sync_design_system.py``. The
blueprints registered here carry the same names and URL prefixes as the upstream packages,
so the copied templates resolve ``url_for('polytec_ui.static', ...)`` unchanged.
"""

from __future__ import annotations

from pathlib import Path

from flask import Blueprint, Flask
from markupsafe import Markup


def kit_static_root(project_root: Path) -> Path:
    return Path(project_root) / "static" / "polytec"


def design_system_version(project_root: Path) -> str:
    version_file = kit_static_root(project_root) / "DESIGN_SYSTEM_VERSION"
    if not version_file.exists():
        return "not-vendored"
    return version_file.read_text(encoding="utf-8").strip()


def init_ui_kit(app: Flask, project_root: Path) -> bool:
    """Register the kit blueprints; returns False when the design system is not vendored yet."""
    static_root = kit_static_root(project_root)
    sprite = static_root / "polytec_ui" / "icons" / "polytec-icons.svg"
    if not sprite.exists():
        return False
    version = design_system_version(project_root)
    source = sprite.read_text(encoding="utf-8")
    # Only the <symbol> children are embedded, matching polytec_ui.__init__ upstream. The source is
    # the app's own vendored sprite file, never user input.
    symbols = Markup(source.partition(">")[2].rpartition("</svg>")[0])  # nosec B704
    app.jinja_env.globals.update(
        polytec_ui_version=version.split()[0],
        design_system_version=version,
        polytec_icon_sprite=symbols,
    )
    for name, url_prefix in (("polytec_ui", "/polytec-ui"), ("ops_platform_ui", "/ops-platform-ui")):
        if name not in app.blueprints:
            app.register_blueprint(Blueprint(name, __name__, static_folder=str(static_root), static_url_path=url_prefix))
    return True

"""The app's user manual in the platform (DOC-05): ``/help`` renders ``docs/user-manual.<lang>.md`` or
``docs/user-manual.md`` in the person's language with the screenshots from ``docs/images``, inside the
app's own layout (``ops_platform_ui/help.html`` of UI Kit 1.16.0). The shell links it as "Help" in the
sidebar footer through ``app_help_url``.

The HTML is sanitised although the files come from the app repository: a manual is edited by people
who do not think about markup. Images may only come from ``docs/images`` by plain file name.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from flask import Blueprint, Flask, abort, render_template, send_file, url_for
from markupsafe import Markup

from .auth import require_permission
from .i18n import current_language
from .manifest import AppManifest

log = logging.getLogger("ops_platform")

_IMAGE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.(png|jpg|jpeg|svg|webp)$")
_IMAGE_SRC = re.compile(r'src="images/([^"]+)"')
_EXTRA_TAGS = {"h1", "h2", "h3", "h4", "p", "pre", "hr", "br", "table", "thead", "tbody", "tr", "th", "td", "img", "kbd"}
_ATTRIBUTES = {"*": ["id"], "a": ["href", "title"], "img": ["src", "alt", "title"], "th": ["align"], "td": ["align"]}


@dataclass(frozen=True)
class Manual:
    title: str
    html: Markup
    toc: list[dict]          # {id, label} of the level-2 headings


class ManualSource:
    """Finds, renders and caches the manual files of one app; re-renders only when a file changed."""

    def __init__(self, docs: Path) -> None:
        self.docs = docs
        self.images = docs / "images"
        self._cache: dict[str, tuple[float, Manual]] = {}

    def path(self, language: str) -> Path | None:
        for name in (f"user-manual.{language}.md", "user-manual.md", "user-manual.en.md"):
            candidate = self.docs / name
            if candidate.is_file():
                return candidate
        return None

    def load(self, language: str, image_url: Callable[[str], str]) -> Manual | None:
        import bleach
        from markdown import Markdown

        path = self.path(language)
        if path is None:
            return None
        stamp, key = path.stat().st_mtime, str(path)
        cached = self._cache.get(key)
        if cached and cached[0] == stamp:
            return cached[1]
        raw = path.read_text(encoding="utf-8")
        title = next((line[2:].strip() for line in raw.splitlines() if line.startswith("# ")), "User manual")
        renderer = Markdown(extensions=["extra", "sane_lists", "toc"], output_format="html")
        html = renderer.convert(raw)
        html = _IMAGE_SRC.sub(lambda m: f'src="{image_url(m.group(1))}"' if _IMAGE_NAME.match(m.group(1)) else 'src=""', html)
        tags = sorted(set(bleach.sanitizer.ALLOWED_TAGS) | _EXTRA_TAGS)
        html = bleach.clean(html, tags=tags, attributes=_ATTRIBUTES, protocols=["http", "https", "mailto"], strip=True)
        manual = Manual(title=title, html=Markup(html),  # nosec B704 - sanitised by bleach just above
                        toc=_toc(getattr(renderer, "toc_tokens", [])))
        self._cache[key] = (stamp, manual)
        return manual

    def image(self, name: str) -> Path | None:
        if not _IMAGE_NAME.match(name):
            return None
        path = self.images / name
        return path if path.is_file() else None


def _toc(tokens: list[dict]) -> list[dict]:
    import bleach

    entries: list[dict] = []
    for token in tokens:
        if token.get("level") == 2:
            entries.append({"id": token["id"], "label": bleach.clean(token["name"], tags=[], strip=True)})
        entries.extend(_toc(token.get("children") or []))
    return entries


def init_manual(app: Flask, project_root: Path, manifest: AppManifest) -> bool:
    """Register ``/help`` when the app has a user manual. ``OPS_HELP_LAYOUT`` names the app template the
    help page extends (default: the bare shell); ``OPS_HELP = False`` switches the page off."""
    source = ManualSource(Path(project_root) / "docs")
    if manifest.is_platform_core or not app.config.get("OPS_HELP", True) or source.path("en") is None:
        return False
    try:
        import bleach  # noqa: F401
        import markdown  # noqa: F401
    except ImportError:
        log.warning("docs/user-manual.md found, but Markdown and bleach are not installed; no Help page (DOC-05)")
        return False

    def guarded(view: Callable[..., Any]) -> Callable[..., Any]:
        return require_permission(manifest.required_permission)(view) if manifest.required_permission else view

    blueprint = Blueprint("ops_help", __name__)

    @blueprint.get("/help")
    @guarded
    def page():  # type: ignore[no-untyped-def]
        manual = source.load(current_language(), lambda name: url_for("ops_help.image", name=name))
        return render_template("ops_platform_ui/help.html", ops_help=manual,
                               ops_help_layout=app.config.get("OPS_HELP_LAYOUT", "ops_platform_ui/base.html"),
                               app_title=manifest.name)

    @blueprint.get("/help/images/<name>")
    @guarded
    def image(name: str):  # type: ignore[no-untyped-def]
        path = source.image(name)
        if path is None:
            abort(404)
        return send_file(path, max_age=3600)

    app.register_blueprint(blueprint)

    @app.context_processor
    def help_link() -> dict[str, str]:
        return {"app_help_url": url_for("ops_help.page")}

    return True

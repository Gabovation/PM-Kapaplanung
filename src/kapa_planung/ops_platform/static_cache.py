"""Static files: a version stamp in every URL, so browsers keep them and pages load without asking again (UI-08).

Without it Flask answers static files with ``Cache-Control: no-cache``: every page load asks the server again for
each stylesheet, script and font. Behind the proxy, on a phone, that delays every page and draws the text in the
fallback font until the font's check returns. ``url_for`` for a static endpoint therefore adds
``v=<modification time of the file>``; answers with ``v`` may be kept for a year (``immutable``) because a changed
file gets a new URL. Fonts are referenced from the UI Kit's CSS without stamp; they are kept for a week.
"""

from __future__ import annotations

import os
from typing import Any

from flask import Flask, request
from werkzeug.security import safe_join

YEAR = 31_536_000
WEEK = 604_800
FONT_SUFFIXES = (".woff2", ".woff", ".ttf", ".otf")


def _is_static(endpoint: str | None) -> bool:
    return bool(endpoint) and (endpoint == "static" or str(endpoint).endswith(".static"))


def _stamp(app: Flask, endpoint: str, filename: str) -> str:
    """Modification time of the file in hex; read on every call, so an edited file gets a new URL at once."""
    blueprint = endpoint.rpartition(".")[0]
    owner = app.blueprints.get(blueprint) if blueprint else app
    folder = getattr(owner, "static_folder", None)
    path = safe_join(folder, filename) if folder else None
    try:
        return format(int(os.stat(path).st_mtime), "x") if path else ""
    except OSError:
        return ""


def init_static_cache(app: Flask) -> None:
    @app.url_defaults
    def _stamp_static_urls(endpoint: str, values: dict[str, Any]) -> None:
        filename = values.get("filename")
        if not _is_static(endpoint) or not filename or "v" in values or filename.lower().endswith(FONT_SUFFIXES):
            return
        stamp = _stamp(app, endpoint, filename)
        if stamp:
            values["v"] = stamp

    @app.after_request
    def _cache_static_files(response):  # type: ignore[no-untyped-def]
        if not _is_static(request.endpoint) or response.status_code not in (200, 304):
            return response
        filename = str((request.view_args or {}).get("filename", "")).lower()
        if request.args.get("v"):
            max_age, immutable = YEAR, True
        elif filename.endswith(FONT_SUFFIXES):
            max_age, immutable = WEEK, False
        else:
            return response
        response.cache_control.no_cache = None
        response.cache_control.public = True
        response.cache_control.max_age = max_age
        response.cache_control.immutable = immutable or None
        return response

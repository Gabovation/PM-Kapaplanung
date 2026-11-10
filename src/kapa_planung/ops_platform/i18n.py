"""Languages (chapter 15, LNG-01..07).

Texts are written in English in code and templates. ``translations/<lang>.json`` maps an English
text to its translation; a missing entry shows the English text. The language belongs to the
person: the portal stores it on the person and mirrors it into the host-wide ``ops_lang`` cookie,
which every app reads. Without the cookie the browser language decides, then English.

    {{ _("Welcome back, {name}", name=first_name) }}      in templates
    t("The database is not reachable right now.")        in Python
"""

from __future__ import annotations

import json
from pathlib import Path

from flask import Flask, g, has_request_context, request

LANGUAGE_COOKIE = "ops_lang"
SOURCE_LANGUAGE = "en"
LANGUAGE_NAMES = {"en": "English", "de": "Deutsch", "sk": "Slovenčina", "cs": "Čeština", "nl": "Nederlands", "hu": "Magyar"}
_EXTENSION = "ops_platform_i18n"


def load_catalogs(project_root: Path, languages: tuple[str, ...]) -> dict[str, dict[str, str]]:
    catalogs: dict[str, dict[str, str]] = {}
    for language in languages:
        if language == SOURCE_LANGUAGE:
            continue
        path = Path(project_root) / "translations" / f"{language}.json"
        catalog = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
        if not isinstance(catalog, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in catalog.items()):
            raise ValueError(f"{path} must be a flat JSON object of English text -> translation")
        catalogs[language] = catalog
    return catalogs


def current_language() -> str:
    if has_request_context() and getattr(g, "ops_language", None):
        return g.ops_language
    return SOURCE_LANGUAGE


def t(text: str, **values: object) -> str:
    """Translate an English text into the current language; ``{name}`` placeholders are filled after."""
    translated = text
    state = _state()
    if state is not None:
        translated = state["catalogs"].get(current_language(), {}).get(text) or text
    return translated.format(**values) if values else translated


def _state() -> dict | None:
    from flask import current_app

    try:
        return current_app.extensions.get(_EXTENSION)
    except RuntimeError:
        return None


def resolve_language(languages: tuple[str, ...]) -> str:
    chosen = request.cookies.get(LANGUAGE_COOKIE, "")
    if chosen in languages:
        return chosen
    return request.accept_languages.best_match(languages) or SOURCE_LANGUAGE


def init_i18n(app: Flask, languages: tuple[str, ...], project_root: Path) -> None:
    app.extensions[_EXTENSION] = {"languages": languages, "catalogs": load_catalogs(project_root, languages)}

    @app.before_request
    def _choose_language() -> None:
        g.ops_language = resolve_language(languages)

    @app.context_processor
    def _document_language() -> dict:
        return {"document_language": current_language()}  # <html lang> of the UI Kit base

    app.jinja_env.globals.update(
        _=t, current_language=current_language,
        available_languages=[(code, LANGUAGE_NAMES.get(code, code)) for code in languages],
    )

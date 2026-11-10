"""Board widgets: pages of a module that a board shows in a same-origin iframe (decision 0021).

A module declares each widget in ``app.manifest.toml`` ``[[widgets]]`` and serves it with
``@widget_route``. The decorator makes the route embeddable (SEC-01, decision 0019), checks the
widget's permission (IAM-04), and parses the board context and the template options against the
declaration. Unknown or invalid values fall back to the declared defaults - a board must never
show a server error because of a link parameter. The template renders with ``ops_embed_mode``
and extends ``ops_platform_ui/embed.html`` (UI-02).

Context is navigation, never a grant: a widget re-checks access for what it reads (IAM-11).
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import wraps
from typing import Any

from flask import Flask, current_app, g, jsonify, render_template, request
from jinja2 import TemplateNotFound

from .auth import current_user, has_permission
from .i18n import t
from .manifest import AppManifest, WidgetSpec

_CONTEXT_VALUE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
MAX_CHOICES = 2000
STATE_TEMPLATE = "ops_platform_ui/widget_state.html"
# Set by init_platform before the app's routes are decorated, so each widget route names its
# permission statically (``required_permission``, IAM-02) like ``@require_permission``.
_manifest: AppManifest | None = None
_STATE_TEXT = {
    "signed-out": "Sign-in required.",
    "forbidden": "No access to this widget.",
    "unknown": "This widget is not available in this version.",
}


@dataclass(frozen=True)
class WidgetRequest:
    """Parsed board context and template options of one widget request."""

    spec: WidgetSpec
    context: dict[str, tuple[str, ...]]
    options: dict[str, Any]
    ignored: tuple[str, ...] = field(default=())   # parameters that fell back to defaults

    def value(self, key: str) -> str | None:
        """First value of a context key, e.g. ``assetCode``; None when the board gave none."""
        values = self.context.get(key, ())
        return values[0] if values else None


def widget_route(widget_id: str, version: int = 1, *,
                 scope: Callable[[WidgetRequest], tuple[str, str | None]] | None = None
                 ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Serve ``[[widgets]]`` ``widget_id``/``version``; the view receives ``widget=WidgetRequest``.

    ``scope`` returns the resource scope to check the permission at, e.g.
    ``lambda w: ("plant", w.value("plantId"))``; default is the corporate scope.
    """

    def decorator(view: Callable[..., Any]) -> Callable[..., Any]:
        declared = _manifest.widget(widget_id, version) if _manifest else None
        if _manifest is not None and declared is None:
            raise RuntimeError(f"widget {widget_id}@{version} is not declared in app.manifest.toml [[widgets]]")

        @wraps(view)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            mark_embeddable()
            spec = current_app.extensions["ops_platform"].manifest.widget(widget_id, version)
            if spec is None:
                raise RuntimeError(f"widget {widget_id}@{version} is not declared in app.manifest.toml [[widgets]]")
            widget = parse_widget_request(spec, request.args)
            g.ops_widget = widget
            kind, key = scope(widget) if scope else (None, None)
            if not has_permission(spec.permission, kind, key):
                return render_widget_state("forbidden", 403)
            return view(*args, widget=widget, **kwargs)

        wrapper.ops_widget = (widget_id, version)  # type: ignore[attr-defined]
        if declared is not None:
            wrapper.required_permission = declared.permission  # type: ignore[attr-defined]
        return wrapper

    return decorator


def widget_choices(widget_id: str, version: int = 1, *,
                   scope: Callable[[WidgetRequest], tuple[str, str | None]] | None = None
                   ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Serve the values a template author can choose for an option that declares ``choices``.

    The view receives ``widget=WidgetRequest`` (the board context the designer previews, e.g.
    ``assetCode``) and returns dicts with ``value``, optional ``label`` and ``group``; the response
    is ``{"choices": [...]}``. Same permission as the widget; JSON, not framable.
    """

    def decorator(view: Callable[..., Any]) -> Callable[..., Any]:
        declared = _manifest.widget(widget_id, version) if _manifest else None
        if _manifest is not None and declared is None:
            raise RuntimeError(f"widget {widget_id}@{version} is not declared in app.manifest.toml [[widgets]]")

        @wraps(view)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            spec = current_app.extensions["ops_platform"].manifest.widget(widget_id, version)
            if spec is None:
                raise RuntimeError(f"widget {widget_id}@{version} is not declared in app.manifest.toml [[widgets]]")
            widget = parse_widget_request(spec, request.args)
            kind, key = scope(widget) if scope else (None, None)
            if not has_permission(spec.permission, kind, key):
                return jsonify(error=_STATE_TEXT["forbidden"]), 403
            choices = []
            for item in view(*args, widget=widget, **kwargs)[:MAX_CHOICES]:
                value = str(item["value"])
                choice = {"value": value, "label": str(item.get("label") or value)}
                if item.get("group"):
                    choice["group"] = str(item["group"])
                choices.append(choice)
            response = jsonify(choices=choices)
            response.headers["Cache-Control"] = "private, no-store"
            return response

        if declared is not None:
            wrapper.required_permission = declared.permission  # type: ignore[attr-defined]
        return wrapper

    return decorator


def mark_embeddable() -> None:
    """Same-origin framing and embed layout for this response (also used for sign-in states)."""
    g.ops_same_origin_embeddable = True
    g.ops_embed_mode = True


def current_widget() -> WidgetRequest | None:
    return g.get("ops_widget")


def is_widget_endpoint(app: Flask, endpoint: str | None) -> bool:
    view = app.view_functions.get(endpoint or "")
    return getattr(view, "ops_widget", None) is not None


def parse_widget_request(spec: WidgetSpec, args: Any) -> WidgetRequest:
    ignored: list[str] = []
    context: dict[str, tuple[str, ...]] = {}
    for key in spec.context:
        values = [v.strip() for v in args.getlist(key) if v.strip()]
        valid = tuple(dict.fromkeys(v for v in values if _CONTEXT_VALUE.match(v)))[:50]
        if len(valid) != len(values):
            ignored.append(key)
        if valid:
            context[key] = valid
    options: dict[str, Any] = {}
    for name, option in spec.options.items():
        raw = args.getlist(name)
        value, ok = _option_value(option, raw)
        options[name] = value
        if raw and not ok:
            ignored.append(name)
    return WidgetRequest(spec, context, options, tuple(ignored))


def _option_value(option: dict[str, Any], raw: list[str]) -> tuple[Any, bool]:
    default, kind, values = option["default"], option["type"], option.get("values")
    if not raw or (kind == "number" and not raw[0].strip()):
        # A number option declared with default "" is "not set" until a template sets it.
        return (None if kind == "number" and default == "" else default), True
    if kind == "list":
        items = [item.strip() for part in raw for item in part.split(",") if item.strip()]
        if values is not None and set(items) - set(values):
            return default, False
        return list(dict.fromkeys(items))[:100], True
    text = raw[0].strip()
    if kind == "enum":
        return (text, True) if text in values else (default, False)
    if kind == "bool":
        if text.lower() in ("1", "true", "yes", "on"):
            return True, True
        if text.lower() in ("0", "false", "no", "off"):
            return False, True
        return default, False
    if kind == "number":
        try:
            value = float(text.replace(",", "."))
        except ValueError:
            return (None if default == "" else default), False
        low, high = option.get("min"), option.get("max")
        if value != value or value in (float("inf"), float("-inf")) or (low is not None and value < low) or (high is not None and value > high):
            return (None if default == "" else default), False
        return value, True
    if kind == "int":
        try:
            number = int(text)
        except ValueError:
            return default, False
        low, high = option.get("min"), option.get("max")
        if (low is not None and number < low) or (high is not None and number > high):
            return default, False
        return number, True
    limit = int(option.get("max_length", 200))
    return (text, True) if len(text) <= limit else (default, False)


def _state_message(state: str) -> str:
    """Forbidden says who is missing the right: the screen (someone may sign in) or the named person."""
    principal = current_user() or {}
    if state == "forbidden" and principal.get("principal_type") == "display":
        return t("Sign in to view this widget.")
    if state == "forbidden" and principal.get("name"):
        return t("You ({name}) don't have access to this widget. Ask your supervisor.", name=principal["name"])
    return t(_STATE_TEXT[state])


def render_widget_state(state: str, status: int) -> tuple[str, int]:
    """A widget-sized page for signed-out, forbidden or unknown states, framable by the board."""
    mark_embeddable()
    message = _state_message(state)
    try:
        return render_template(STATE_TEMPLATE, widget_state=state, widget_message=message), status
    except TemplateNotFound:
        return message, status


def resolve_assets(plant_id: str | None, work_centers: tuple[str, ...] | list[str]) -> list[str]:
    """Asset codes of the given SAP work centers of one plant (``assets@1``).

    Work center numbers are unique per plant only (MD-04), so a plant is required. Declare
    ``assets@1`` under ``[master_data].consumes`` to use this.
    """
    if not plant_id or not work_centers:
        return []
    from .mongo import get_core_database

    cursor = get_core_database()["assets"].find(
        {"plantId": plant_id, "sapReferences.workCenterNumber": {"$in": list(work_centers)},
         "isActive": {"$ne": False}},
        {"assetCode": 1})
    return sorted({doc["assetCode"] for doc in cursor if doc.get("assetCode")})


def init_widgets(app: Flask, manifest: AppManifest | None = None) -> None:
    global _manifest
    _manifest = manifest

    @app.context_processor
    def embed_context() -> dict[str, Any]:
        return {"ops_embed_mode": bool(g.get("ops_embed_mode")), "ops_widget": current_widget()}

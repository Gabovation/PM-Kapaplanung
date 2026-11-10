"""Permission checks (IAM-01..05).

The platform core (the portal at ``/``) is the only login. Modules choose a mode with
``PLATFORM_AUTH_MODE``:

``off``
    every request is allowed, but each route still names the permission it will need and
    undeclared permissions are refused - for local development and apps not yet switched.
``shared``
    the ``ops_session`` cookie is resolved against ``sessions`` in the core database, then the
    person and their roles (read-only, cached for ``AUTH_CACHE_SECONDS``). Without a valid session
    the browser goes to the portal login and comes back; without access to this app, or without
    its ``[access].required_permission``, the answer is 403. Grants come only from the app's
    imported catalogue and the person's role-at-scope assignments; platform administrators bypass
    valid app scopes.

The portal enforces its idle timeout; modules check expiry, session version and whether the
person may still log in, so a logout, password change or deactivation in the portal ends the
session in every module within the cache time.

A card sign-in on a registered screen adds the person's rights to the screen's (decision 0032):
the board stays readable for a worker without roles, and writes are recorded under the person.
The portal's default roles (``display_default_roles``) are added there too, and only there (0034).
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from datetime import UTC, datetime
from functools import wraps
from typing import Any, Callable
from urllib.parse import quote

from flask import Flask, abort, current_app, g, redirect, request

from .config import env_int
from .manifest import PLATFORM_SESSION_COOKIE, AppManifest
from .access import PERSON_METHODS, permissions_by_scope
from .displays import DISPLAY_SESSION_COOKIE, default_permissions_by_scope, display_permissions_by_scope

SUPPORTED_MODES = ("off", "shared")
SYSTEM_ROLE = "ROLE-systemadministrator"
_EXTENSION = "ops_platform_auth"
_OPEN_ENDPOINT_PREFIXES = ("ops_health.", "ops_pwa.")


def init_auth(app: Flask, manifest: AppManifest) -> None:
    mode = os.getenv("PLATFORM_AUTH_MODE", "off").strip().lower()
    if mode not in SUPPORTED_MODES:
        # Fail closed: an app configured for a mode this kit cannot enforce must not start.
        raise RuntimeError(f"PLATFORM_AUTH_MODE={mode!r} is not supported by kit version; supported: {SUPPORTED_MODES}")
    if mode == "shared" and manifest.is_platform_core:
        raise RuntimeError("PLATFORM_AUTH_MODE=shared is for modules; the platform core is the login itself")
    state: dict[str, Any] = {"mode": mode, "permissions": dict(manifest.permissions),
                             "required": manifest.required_permission}
    app.extensions[_EXTENSION] = state
    if mode == "shared":
        from .mongo import get_core_database

        state["resolver"] = SessionResolver(get_core_database, manifest.app_id, env_int("AUTH_CACHE_SECONDS", 30),
                                            manifest.access_catalogue(), manifest.display_policy)
        state["login_url"] = os.getenv("PLATFORM_LOGIN_URL", "").strip() or "/login"
        app.before_request(_authenticate)
        @app.after_request
        def private_response(response):
            endpoint = request.endpoint or ""
            if endpoint != "static" and not endpoint.endswith(".static"):
                response.headers["Cache-Control"] = "private, no-store"
                response.headers["Pragma"] = "no-cache"
            return response
    app.jinja_env.globals.update(current_person=current_user, has_permission=has_permission)
    @app.context_processor
    def display_context():
        principal = current_user() or {}
        screen = getattr(g, "ops_screen", None)
        mode = principal.get("principal_type") == "display"
        card = screen is not None and not mode
        return {
            "ops_display_mode": mode,
            # The registered screen this request comes from: the display itself or a card person on it.
            "ops_screen": screen,
            # Operators stay on the board; a card person with full navigation on screens may leave it.
            "ops_screen_locked": screen is not None and (mode or not principal.get("screen_navigation", True)),
            "ops_card_session": {
                "expires_at_ms": _aware(principal.get("expires_at")).timestamp() * 1000,
                "activity_url": "/display/card/activity", "sign_out_url": "/display/card/sign-out"} if card else None,
            # Renewal keeps running while a card person is signed in, so the screen resumes after sign-out.
            "ops_display_connection": {
                "renew_url": "/display/renew", "resume_url": "/display/resume", "registration_url": "/display",
                "revision": screen.get("revision"), "app_id": manifest.app_id,
                "expires_at_ms": _aware(screen.get("expires_at")).timestamp() * 1000} if screen else None}


def require_permission(permission: str, *, scope: Callable[..., tuple[str, str | None]] | None = None,
                       any_scope: bool = False) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Resource scope checks by default; any_scope is only for scope-filtered lists."""
    if scope is not None and any_scope:
        raise ValueError("Choose resource scope or any_scope, not both")
    def decorator(view: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(view)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            state = current_app.extensions[_EXTENSION]
            if permission not in state["permissions"]:
                raise RuntimeError(f"permission {permission!r} is not declared in app.manifest.toml [permissions]")
            kind, key = scope(*args, **kwargs) if scope else (None, None)
            if state["mode"] == "shared":
                person = current_user() or {}
                allowed = permission in (person.get("grants") or ()) if any_scope else has_permission(permission, kind, key)
                if not allowed:
                    abort(403)
            return view(*args, **kwargs)

        wrapper.required_permission = permission  # type: ignore[attr-defined]
        return wrapper

    return decorator


def current_user() -> dict[str, Any] | None:
    """Authenticated principal; principal_type distinguishes person/display. None in off mode.

    Displays are not alert recipients/persons; they write only with an administrator-chosen
    role, recorded under the display id/name. Both expose id/name, email, language and
    plantId; a display's plantId is its home plant for navigation, never a grant.
    """
    return getattr(g, "ops_person", None)


def has_permission(permission: str, scope_type: str | None = None, scope_id: str | None = None) -> bool:
    """For showing or hiding actions in templates; routes use ``@require_permission``. True in mode 'off'."""
    if current_app.extensions[_EXTENSION]["mode"] == "off":
        return True
    person = current_user()
    if person is None:
        return False
    # Omitting context checks only corporate actions. A plant-only app cannot
    # accidentally authorize a resource using the union of other plants' grants.
    return permission in person.get("scope_grants", {}).get((scope_type or "corporate", scope_id), frozenset())


def authorized_scopes(permission: str, scope_type: str) -> frozenset[str | None]:
    """Scopes to constrain queries/exports; never use a navigation filter as authorization.

    In mode 'off' nobody is signed in and every check passes, so every active scope is returned.
    """
    state = current_app.extensions[_EXTENSION]
    if state["mode"] == "off":
        return _active_scopes(scope_type)
    person = current_user() or {}
    return frozenset(key for (kind, key), grants in person.get("scope_grants", {}).items()
                     if kind == scope_type and permission in grants)


def _active_scopes(scope_type: str) -> frozenset[str | None]:
    if scope_type == "corporate":
        return frozenset({None})
    from .mongo import get_core_database

    collection, key = {"plant": ("plants", "plantId"), "org_unit": ("org_units", "orgUnitId")}[scope_type]
    return frozenset(d[key] for d in get_core_database()[collection].find({"active": {"$ne": False}}, {key: 1}))


def independently_authenticated(verify: Callable[[], Any]) -> Callable:
    """Opt one endpoint into mandatory machine authentication instead of browser sessions.

    The verifier must abort on failure. It runs even with PLATFORM_AUTH_MODE=off;
    this marker never authenticates another endpoint or establishes a user session.
    Apply beneath the Flask route decorator. Outer wrappers must preserve metadata
    with functools.wraps; a rate limiter should wrap this verifier to count failures.
    """
    def decorate(view: Callable) -> Callable:
        @wraps(view)
        def authenticated(*args: Any, **kwargs: Any) -> Any:
            verify()
            return view(*args, **kwargs)
        authenticated._ops_independent_auth = True  # type: ignore[attr-defined]
        return authenticated
    return decorate


def _authenticate() -> Any:
    endpoint = request.endpoint or ""
    if endpoint == "static" or endpoint.endswith(".static") or endpoint.startswith(_OPEN_ENDPOINT_PREFIXES):
        return None
    view = current_app.view_functions.get(endpoint)
    if getattr(view, "_ops_independent_auth", False):
        return None
    state = current_app.extensions[_EXTENSION]
    resolver, declared = state["resolver"], state["permissions"]
    person = resolver.resolve(request.cookies.get(PLATFORM_SESSION_COOKIE, ""), declared)
    screen = None
    if person is None:
        person = screen = resolver.resolve_display(request.cookies.get(DISPLAY_SESSION_COOKIE, ""), declared)
    elif person["authentication_method"] == "card" and person["device_id"]:
        # Only card sessions are bound to a screen; other sessions never pay for this lookup.
        screen = resolver.resolve_display(request.cookies.get(DISPLAY_SESSION_COOKIE, ""), declared)
        if screen is not None and screen["id"] == person["device_id"]:
            person = _with_screen_rights(person, screen)
        else:
            screen = None
    g.ops_person, g.ops_screen = person, screen
    # A widget is shown inside a board's iframe: a redirect to the login or display resume page
    # would land on a page that refuses framing. Answer with a small framable state instead.
    from .widgets import is_widget_endpoint, render_widget_state

    widget = is_widget_endpoint(current_app, endpoint)
    if person is None:
        if widget:
            return render_widget_state("signed-out", 401)
        if _wants_json():
            return {"error": "Sign-in required."}, 401
        target = request.script_root + request.full_path.rstrip("?")
        if state["resolver"]._display_policy:
            return redirect(f"/display/resume?next={quote(target, safe='/')}")
        return redirect(f"{state['login_url']}?next={quote(target, safe='/')}")
    if state["required"] not in person["grants"]:
        if widget:
            return render_widget_state("forbidden", 403)
        if _wants_json():
            return {"error": "No access to this module."}, 403
        abort(403)
    return None


def _with_screen_rights(person: dict[str, Any], screen: dict[str, Any]) -> dict[str, Any]:
    """A new principal (cached values stay untouched): the person plus what the screen may do plus
    the default roles of people signed in on screens."""
    scopes = dict(screen["scope_grants"])
    for source in (screen.get("default_scope_grants", {}), person["scope_grants"]):
        for key, grants in source.items():
            scopes[key] = scopes.get(key, frozenset()) | grants
    return {**person, "scope_grants": scopes, "grants": frozenset().union(person["grants"], *scopes.values())}


def _wants_json() -> bool:
    return request.is_json or "/api/" in request.path or request.accept_mimetypes.best == "application/json"


class SessionResolver:
    """``ops_session`` token -> person with grants for one app, cached per token for a few seconds."""

    def __init__(self, database: Callable[[], Any], app_id: str, cache_seconds: int, catalogue: dict,
                 display_policy: dict | None = None) -> None:
        self._database = database
        self._app_id = app_id
        self._cache_seconds = max(cache_seconds, 0)
        self._catalogue = catalogue
        self._display_policy = display_policy or {}
        self._cache: dict[str, tuple[float, dict[str, Any] | None]] = {}
        self._lock = threading.Lock()

    def resolve(self, token: str, declared: dict[str, str]) -> dict[str, Any] | None:
        if not token:
            return None
        key = hashlib.sha256(token.encode("utf-8")).hexdigest()
        now = time.monotonic()
        with self._lock:
            cached = self._cache.get(key)
            # A cached person never outlives the session: card sessions end at their idle time.
            if cached and now - cached[0] < self._cache_seconds and (
                    cached[1] is None or _aware(cached[1]["expires_at"]) > datetime.now(UTC)):
                return cached[1]
        person = self._lookup(key, declared)
        with self._lock:
            if len(self._cache) > 5000:
                self._cache.clear()
            self._cache[key] = (now, person)
        return person

    def resolve_display(self, token: str, declared: dict[str, str]) -> dict[str, Any] | None:
        if not token or not self._display_policy:
            return None
        key = hashlib.sha256(token.encode()).hexdigest()
        cache_key = "display:" + key
        now = time.monotonic()
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached and now - cached[0] < min(self._cache_seconds, 30):
                value = cached[1]
                if value and _aware(value.get("expires_at")) > datetime.now(UTC):
                    return value
        db = self._database()
        session = db.display_sessions.find_one({"_id": key})
        device = (db.display_devices.find_one({"_id": session.get("deviceId")}, {"credential_hash": 0})
                  if session and _aware(session.get("expiresAt")) > datetime.now(UTC) else None)
        catalogue = db.app_access_catalogues.find_one({"_id": self._app_id, "enabled": True})
        value = None
        if (device and device.get("enabled") and device.get("revision") == session.get("deviceRevision") and
                catalogue and all(catalogue.get(k) == v for k, v in self._catalogue.items()) and
                catalogue.get("display_policy") == self._display_policy):
            scopes = display_permissions_by_scope(db, device, self._app_id, declared)
            # Default roles reach only a person signed in on this card terminal (_with_screen_rights).
            defaults = default_permissions_by_scope(db, self._app_id, declared) if device.get("card_sign_in") else {}
            value = {"id": device["_id"], "name": device["name"], "email": "", "plantId": device.get("plantId"), "language": device.get("language", "en"),
                     "principal_type": "display", "revision": device["revision"], "scope_grants": scopes,
                     "grants": frozenset().union(*scopes.values()), "expires_at": session["expiresAt"],
                     "card_sign_in": bool(device.get("card_sign_in")), "default_scope_grants": defaults}
        with self._lock:
            if len(self._cache) > 5000:
                self._cache.clear()
            self._cache[cache_key] = (now, value)
        return value

    def _lookup(self, key: str, declared: dict[str, str]) -> dict[str, Any] | None:
        db = self._database()
        session = db.sessions.find_one({"_id": key})
        if not session or not session.get("personId") or _aware(session.get("expiresAt")) <= datetime.now(UTC):
            return None
        person = db.persons.find_one({"id": session["personId"]})
        method = session.get("authenticationMethod", "password")
        if (method not in PERSON_METHODS or not person or person.get("active") is False
                or not person.get("login_enabled") or (person.get("must_change_password") and method == "password")):
            return None
        if person.get("session_version") != session.get("sessionVersion"):
            return None
        resolved = {
            "id": person["id"], "name": person.get("name", ""), "email": person.get("email", ""), "principal_type": "person",
            "language": person.get("language"), "plantId": session.get("plantId"), "grants": frozenset(), "scope_grants": {},
            "authentication_method": method, "device_id": session.get("deviceId"), "expires_at": session["expiresAt"],
            "screen_navigation": person.get("screen_navigation", True),
        }
        catalogue = db.app_access_catalogues.find_one({"_id": self._app_id, "enabled": True})
        # Fail closed when a deployed manifest and the imported role definition differ.
        if catalogue and all(catalogue.get(k) == v for k, v in self._catalogue.items()):
            scopes = permissions_by_scope(db, person, self._app_id, declared, authentication_method=method)
            resolved.update(scope_grants=scopes, grants=frozenset().union(*scopes.values()))
        return resolved


def _aware(value: datetime | None) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=UTC)
    # MongoDB returns naive UTC datetimes.
    return value if value.tzinfo else value.replace(tzinfo=UTC)

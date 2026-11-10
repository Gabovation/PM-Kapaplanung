"""Display principals, using the same app roles and scope precedence as people.

Only the portal issues credentials/sessions or changes these records. Modules read
them with their existing core database connection. No person/platform bypass applies.
"""
from __future__ import annotations

from urllib.parse import unquote, urlsplit

from .access import scope_options

DISPLAY_COOKIE = "ops_display"
DISPLAY_SESSION_COOKIE = "ops_display_session"
PAIR_COOKIE = "ops_display_pair"
DEFAULT_ROLES_ID = "default"


def safe_start_path(value: str, app_id: str) -> str:
    """A same-host module URL; reject encoded traversal and ambiguous separators."""
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("Choose a starting dashboard inside the selected app.")
    decoded = value
    for _ in range(4):
        updated = unquote(decoded)
        if updated == decoded:
            break
        decoded = updated
    url = urlsplit(decoded)
    if (unquote(decoded) != decoded or url.scheme or url.netloc or url.fragment or "\\" in decoded or
            any(ord(c) < 32 for c in decoded) or
            not url.path.startswith(f"/{app_id}/") or
            any(part in {".", ".."} for part in url.path.split("/"))):
        raise ValueError("Choose a starting dashboard inside the selected app.")
    return value


def display_policy(catalogue: dict) -> dict:
    return catalogue.get("display_policy") or {}


def display_roles(catalogue: dict) -> list:
    """Roles screens may use: the portal administrator's choice, else the manifest's default."""
    if "display_roles" in catalogue:
        return list(catalogue.get("display_roles") or [])
    return list(display_policy(catalogue).get("allowed_roles", []))


def valid_display_role(catalogue: dict, role_id: str) -> bool:
    # Only apps that opted in via [display]. Chosen roles work as for people, edit roles included.
    role = catalogue.get("roles", {}).get(role_id, {})
    permissions = set(role.get("permissions", []))
    return bool(display_policy(catalogue) and role_id in display_roles(catalogue) and permissions and
                catalogue.get("required_permission") in permissions)


def display_permissions_by_scope(db, device: dict, app_id: str, declared: dict) -> dict:
    if not device.get("enabled"):
        return {}
    return _permissions_by_scope(db, device, app_id, declared)


def default_permissions_by_scope(db, app_id: str, declared: dict) -> dict:
    """Default roles (``display_default_roles``): what every person signed in on a screen may do
    there besides the screen's and their own rights (decision 0034). Same roles as screens."""
    return _permissions_by_scope(db, db.display_default_roles.find_one({"_id": DEFAULT_ROLES_ID}) or {},
                                 app_id, declared)


def _permissions_by_scope(db, holder: dict, app_id: str, declared: dict) -> dict:
    catalogue = db.app_access_catalogues.find_one({"_id": app_id, "enabled": True})
    if not catalogue:
        return {}
    assignments = holder.get("apps", {}).get(app_id, {}).get("assignments", [])
    result = {}
    for kind, key in scope_options(db, catalogue):
        chosen = next((a for a in assignments if a.get("scope_type") == kind and a.get("scope_id") == key), None)
        if chosen is None and "corporate" in catalogue["scopes"]:
            chosen = next((a for a in assignments if a.get("scope_type") == "corporate" and a.get("scope_id") is None), None)
        role_id = (chosen or {}).get("role_id")
        permissions = catalogue.get("roles", {}).get(role_id, {}).get("permissions", [])
        result[kind, key] = (frozenset(permissions) & frozenset(declared)
                            if valid_display_role(catalogue, role_id) else frozenset())
    return result

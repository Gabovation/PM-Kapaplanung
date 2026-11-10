"""One role-at-scope resolver for portal previews and module enforcement.

A person reaches an app only through an app role at a scope (person_app_access) or as platform
administrator. Corporate assignments are defaults, not extra grants: a leaf assignment replaces
them completely. The former role model (roles with app ids, overrides, creator ceilings,
legacy_permissions) is removed (decision 0014).
"""
from __future__ import annotations

from typing import Any

SYSTEM_ROLE = "ROLE-systemadministrator"
SCOPE_TYPES = ("corporate", "plant", "org_unit")


# Methods of portal-issued person sessions. A pending local-password change only restricts
# password sessions: Microsoft and card (registered terminal) sign-ins never use that password.
PERSON_METHODS = frozenset({"password", "entra", "card"})


def resolve_access(db: Any, person: dict, app_id: str, declared: dict,
                   scope_type: str = "corporate", scope_id: str | None = None, *,
                   scoped: bool = True,
                   require_login: bool = True, system_bypass: bool = True,
                   catalogue: dict | None = None, authentication_method: str = "password") -> dict:
    """Return permissions, role and source for one resource scope; deny by default.

The UI can preview contacts without logins. Enforcement keeps require_login=True.
system_bypass=False is for work assignments such as choosing a CIP controller.
catalogue is a trusted portal-only preview of a not-yet-enabled import. ``scoped`` is accepted for
callers written before 4.0; only True is valid.
"""
    if not scoped:
        raise ValueError("Only scoped access exists; the former role model is removed (decision 0014).")
    result = {"permissions": frozenset(), "role_id": None, "source": None}
    person_id = person.get("id") if person else None
    if not person_id or person.get("active") is False:
        return result
    # This context comes only from a portal-issued server-side session.
    if require_login and (authentication_method not in PERSON_METHODS
                          or not person.get("login_enabled")
                          or (person.get("must_change_password") and authentication_method == "password")):
        return result
    catalogue = catalogue or db.app_access_catalogues.find_one({"_id": app_id, "enabled": True})
    if not catalogue or scope_type not in catalogue["scopes"] or (scope_type == "corporate" and scope_id is not None):
        return result
    if scope_type != "corporate":
        collection, key = ("plants", "plantId") if scope_type == "plant" else ("org_units", "orgUnitId")
        if not scope_id or not db[collection].find_one({key: scope_id, "active": {"$ne": False}}):
            return result
    document = db.person_app_access.find_one({"_id": person_id}) or {}
    assignments = document.get("apps", {}).get(app_id, {}).get("assignments", [])
    chosen = next((a for a in assignments if a["scope_type"] == scope_type and a.get("scope_id") == scope_id), None)
    if chosen is None and "corporate" in catalogue["scopes"]:
        chosen = next((a for a in assignments if a["scope_type"] == "corporate"), None)
    if chosen:
        role_id = chosen.get("role_id")
        role = catalogue["roles"].get(role_id, {})
        result.update(role_id=role_id, source=chosen["scope_type"],
                      permissions=frozenset(role.get("permissions", [])) & frozenset(declared))
    if system_bypass and SYSTEM_ROLE in (person.get("role_ids") or []):
        result.update(permissions=frozenset(declared), source="platform")
    return result


def scope_options(db: Any, catalogue: dict) -> list[tuple[str, str | None]]:
    """Active resource scopes, never inferred from the current navigation selection."""
    scopes = [("corporate", None)] if "corporate" in catalogue["scopes"] else []
    for kind, collection, key in (("plant", "plants", "plantId"), ("org_unit", "org_units", "orgUnitId")):
        if kind in catalogue["scopes"]:
            scopes.extend((kind, item[key]) for item in db[collection].find({"active": {"$ne": False}}))
    return scopes


def permissions_by_scope(db: Any, person: dict, app_id: str, declared: dict, *,
                         authentication_method: str = "password") -> dict:
    catalogue = db.app_access_catalogues.find_one({"_id": app_id, "enabled": True})
    if not catalogue:
        return {}
    return {(kind, key): resolve_access(db, person, app_id, declared, kind, key, scoped=True,
                                       authentication_method=authentication_method)["permissions"]
            for kind, key in scope_options(db, catalogue)}

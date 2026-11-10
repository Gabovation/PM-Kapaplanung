"""Role catalogue validation and the explicit v1-to-v2 snapshot migration."""
from __future__ import annotations

from copy import deepcopy
import hashlib
import re


def default_roles() -> list[dict[str, str]]:
    return [
        {"id": "project-manager", "name": "Projektleiter"},
        {"id": "qvp", "name": "QVP"},
    ]


def validate_roles(snapshot: dict) -> None:
    roles = snapshot.get("roles")
    if not isinstance(roles, list) or not 1 <= len(roles) <= 100:
        raise ValueError("Bitte zwischen einer und 100 Rollen hinterlegen.")
    ids, names = set(), set()
    for role in roles:
        if not isinstance(role, dict):
            raise ValueError("Ungültige Rolle.")
        key, name = role.get("id"), role.get("name")
        if not isinstance(key, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", key):
            raise ValueError("Ungültige Rollen-ID.")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 100 or name != name.strip():
            raise ValueError("Eine Rollenbezeichnung muss zwischen 1 und 100 Zeichen enthalten.")
        if key in ids or name.casefold() in names:
            raise ValueError("Rollen müssen eindeutige IDs und Bezeichnungen haben.")
        ids.add(key)
        names.add(name.casefold())
    people = snapshot.get("people")
    if not isinstance(people, list):
        raise ValueError("Ungültige Personenliste.")
    for person in people:
        if (not isinstance(person, dict) or not isinstance(person.get("roleId"), str)
                or person["roleId"] not in ids or "role" in person):
            raise ValueError("Jede Person benötigt eine gültige Rolle aus der Rollenverwaltung.")


def prepare_snapshot(source: dict) -> dict:
    """Used only by the migration CLI and explicit backup import, never by normal reads."""
    if not isinstance(source, dict) or source.get("version") not in (1, 2):
        raise ValueError("Die Datei ist keine unterstützte Planungssicherung.")
    snapshot = deepcopy(source)
    if not isinstance(snapshot.get("people"), list) or not isinstance(snapshot.get("projects"), list):
        raise ValueError("Die Datei enthält keine gültige Personen- und Projektliste.")
    if snapshot["version"] == 1:
        snapshot["roles"] = default_roles()
        lookup = {"projektleitung": "project-manager", "projektleiter": "project-manager", "qvp": "qvp"}
        for person in snapshot["people"]:
            name = person.get("role", "")
            if not isinstance(name, str) or not name.strip():
                raise ValueError("Eine vorhandene Person hat keine gültige Rollenbezeichnung.")
            name = name.strip()
            canonical = name.casefold()
            if canonical not in lookup:
                key = "legacy-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
                snapshot["roles"].append({"id": key, "name": name})
                lookup[canonical] = key
            person["roleId"] = lookup[canonical]
            del person["role"]
        snapshot["version"] = 2
    validate_roles(snapshot)
    return snapshot

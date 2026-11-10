"""Effective shared cost catalogue: immutable imports plus portal-owned settings.

Keep this interpretation shared by administration and assignment consumers (MD-03).
Settings are explicit platform approval, not a claim of SAP validation or lifecycle.
"""
from __future__ import annotations

import hashlib


KINDS = {"cc": ("sap_cost_centers", "costCenterNumber"),
         "wbs": ("sap_wbs_elements", "wbsNumber")}


def object_id(kind: str, number: str) -> str:
    """An opaque route/database key also supports WBS keys containing slashes."""
    return hashlib.sha256(f"{kind}:{number}".encode("utf-8")).hexdigest()


def catalogue(database, plant_id: str | None = None, *, include_history: bool = False) -> list[dict]:
    settings = {row["_id"]: row for row in database.cost_object_settings.find({}, None if include_history else {"history": 0})}
    rows = {}
    for kind, (collection, field) in KINDS.items():
        query = {}
        if plant_id is not None:
            approved = [s["number"] for s in settings.values()
                        if s["type"] == kind and s["mode"] == "override" and s["active"] and plant_id in s["plantIds"]]
            query = {"$or": [
                {"active": {"$ne": False}, "$or": [
                    {"source": "legacy-bootstrap", "activePlantIds": plant_id},
                    {"source": {"$ne": "legacy-bootstrap"},
                     "$or": [{"plantId": plant_id}, {"plantIds": plant_id}]}]},
                {field: {"$in": approved}}]}
        projection = {field: 1, "text": 1, "source": 1, "active": 1,
                      "plantId": 1, "plantIds": 1, "activePlantIds": 1}
        for source in database[collection].find(query, projection):
            number = source[field]
            oid = object_id(kind, number)
            plants = source.get("activePlantIds", []) if source.get("source") == "legacy-bootstrap" else list(
                dict.fromkeys(([source["plantId"]] if source.get("plantId") else []) + source.get("plantIds", [])))
            rows[oid] = {"_id": oid, "type": kind, "number": number, "text": source.get("text") or "",
                         "active": source.get("active", True), "plantIds": plants,
                         "source": "legacy" if source.get("source") == "legacy-bootstrap" else "sap",
                         "sourceText": source.get("text") or "", "sourceActive": source.get("active", True),
                         "sourcePlantIds": plants, "version": 0, "configured": False, "mode": "inherit"}
    for oid, setting in settings.items():
        row = rows.get(oid)
        if row is None and plant_id is not None and setting["mode"] == "inherit":
            continue
        if row is None and (setting.get("origin") != "manual" or setting["mode"] == "inherit"):
            # An import removed a reference: retain the setting for diagnosis, never turn it
            # into a silently approved manual entry.
            if plant_id is not None:
                continue
            row = {"_id": oid, "type": setting["type"], "number": setting["number"], "text": "",
                   "source": "missing", "sourceText": "", "sourceActive": False, "sourcePlantIds": []}
        if row is None:
            row = {"_id": oid, "type": setting["type"], "number": setting["number"], "source": "manual",
                   "sourceText": "", "sourceActive": None, "sourcePlantIds": []}
        if setting["mode"] == "override":
            row.update(text=setting["label"], active=setting["active"] and row["source"] != "missing",
                       plantIds=setting["plantIds"])
        elif row["source"] == "missing":
            row.update(text="", active=False, plantIds=[])
        row.update(version=setting["version"], configured=setting["mode"] == "override", mode=setting["mode"],
                   updatedAt=setting["updatedAt"], updatedBy=setting["updatedBy"],
                   history=setting.get("history", []))
        rows[oid] = row
    return sorted((r for r in rows.values() if plant_id is None or (r["active"] and plant_id in r["plantIds"])),
                  key=lambda r: (r["type"], r["number"]))

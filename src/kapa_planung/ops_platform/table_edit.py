"""Opaque revisions and compare-and-set selectors for platform-owned catalogue edits.

The caller still authorizes, validates and whitelists every change. Tokens carry no grants.
"""
from __future__ import annotations

import hashlib

from bson import json_util


def revision(document: dict) -> str:
    return hashlib.sha256(json_util.dumps(document, sort_keys=True).encode("utf-8")).hexdigest()


def snapshot_filter(document: dict) -> dict:
    # Use literal equality even for object/array values. Added fields are preserved by $set;
    # changed/deleted fields and another inline writer invalidate this snapshot atomically.
    terms = [{key: {"$eq": value}} for key, value in document.items() if key != "editHistory"]
    if "_tableEditRevision" not in document:
        terms.append({"_tableEditRevision": {"$exists": False}})
    return {"$and": terms}

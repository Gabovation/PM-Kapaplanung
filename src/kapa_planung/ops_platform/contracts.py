"""Master-data contracts at runtime: load a contract and validate a document against it (MD-08).

A module that is the ``x-writer`` of a contract, and the data-sync job, check every document before
writing. The schemas are the vendored copies in ``ops_platform/master_data`` (generated from
``master-data/schemas`` by ``tools/sync_platform_kit.py``, never edited in the app, MD-03).

``jsonschema`` is imported lazily: only apps that validate declare it in their requirements.
"""

from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any

VENDORED_DIR = Path(__file__).resolve().parent / "master_data"


def _file(collection: str, major: int) -> str:
    """Major 1 lives in ``<collection>.schema.json``, later majors in ``<collection>.vN.schema.json``."""
    return f"{collection}.schema.json" if major == 1 else f"{collection}.v{major}.schema.json"


@lru_cache(maxsize=None)
def _load(collection: str, major: int, directory: str) -> dict[str, Any]:
    path = Path(directory) / _file(collection, major)
    if not path.is_file():
        raise FileNotFoundError(f"No contract {collection}@{major} in {directory}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_contract(collection: str, major: int = 1, directory: Path | None = None) -> dict[str, Any]:
    """The JSON Schema of ``<collection>@<major>`` (cached; do not modify the result)."""
    return _load(collection, major, str(directory or VENDORED_DIR))


def to_jsonable(value: Any) -> Any:
    """BSON-typed document -> plain JSON types, so JSON Schema can check it.

    Datetimes become ISO strings, Decimal/Decimal128 numbers, ObjectId-like values strings.
    """
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dt.datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.timezone.utc)
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "to_decimal"):  # bson.Decimal128 without importing bson
        return float(value.to_decimal())
    if type(value).__name__ == "ObjectId":
        return str(value)
    return value


@lru_cache(maxsize=None)
def _validator(collection: str, major: int, directory: str) -> Any:
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError as error:  # pragma: no cover - environment problem, not a data problem
        raise RuntimeError("Validating against contracts needs the 'jsonschema' package in requirements.txt") from error
    return Draft202012Validator(_load(collection, major, directory), format_checker=FormatChecker())


def validate_document(collection: str, document: dict[str, Any], major: int = 1,
                      directory: Path | None = None) -> list[str]:
    """Violations of the contract as readable lines ``path: message``; empty list = valid."""
    validator = _validator(collection, major, str(directory or VENDORED_DIR))
    errors = sorted(validator.iter_errors(to_jsonable(document)), key=lambda e: list(map(str, e.absolute_path)))
    return [f"{'/'.join(map(str, e.absolute_path)) or '<document>'}: {e.message}" for e in errors]

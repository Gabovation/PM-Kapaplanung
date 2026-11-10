"""The app's own MongoDB database (DB-01..06). One client per process; pymongo pools internally."""

from __future__ import annotations

import os
import threading
import time
from typing import Any

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

from .config import PLACEHOLDER_MARKERS, env_int

DEFAULT_APP_NAME: str | None = None  # set to the manifest app id by init_platform
_client: MongoClient | None = None
_client_lock = threading.Lock()
_stats_cache: tuple[float, dict[str, Any]] | None = None


def _mongodb_uri() -> str:
    uri = os.getenv("MONGODB_URI", "").strip()
    if not uri:
        raise RuntimeError("MONGODB_URI is required and was not set")
    if any(marker in uri for marker in PLACEHOLDER_MARKERS):
        raise RuntimeError("MONGODB_URI still contains a placeholder from .env.example")
    return uri


def get_client() -> MongoClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = MongoClient(
                _mongodb_uri(),
                serverSelectionTimeoutMS=env_int("MONGODB_TIMEOUT_MS", 5000),
                # Shows up in currentOp/Atlas profiler, so load can be attributed per app (MON-06).
                appname=os.getenv("MONGODB_APP_NAME") or DEFAULT_APP_NAME,
            )
        return _client


def get_database(default_name: str | None) -> Database:
    return get_client()[os.getenv("MONGODB_DATABASE", "").strip() or default_name]


def get_core_database() -> Database:
    """The platform's core database (persons, roles, sessions, master data) - read-only for modules, apart from the
    master-data collections whose contract names the module as writer (MD-01, MD-08)."""
    name = os.getenv("CORE_MONGODB_DATABASE", "").strip()
    if not name:
        raise RuntimeError("CORE_MONGODB_DATABASE is not set")
    return get_client()[name]


def ping() -> bool:
    try:
        get_client().admin.command("ping")
        return True
    except (PyMongoError, RuntimeError):
        return False


def database_stats(default_name: str, max_age_seconds: float = 300.0) -> dict[str, Any] | None:
    """``dbStats`` summary for /health/metrics, cached because it is not free on large databases."""
    global _stats_cache
    now = time.monotonic()
    if _stats_cache and now - _stats_cache[0] < max_age_seconds:
        return _stats_cache[1]
    try:
        raw = get_database(default_name).command("dbStats", scale=1024 * 1024)
    except (PyMongoError, RuntimeError):
        return None
    stats = {
        "name": raw.get("db"),
        "collections": raw.get("collections"),
        "objects": raw.get("objects"),
        "dataSizeMB": round(float(raw.get("dataSize", 0)), 1),
        "storageSizeMB": round(float(raw.get("storageSize", 0)), 1),
        "indexSizeMB": round(float(raw.get("indexSize", 0)), 1),
    }
    _stats_cache = (now, stats)
    return stats


def close() -> None:
    global _client
    with _client_lock:
        if _client is not None:
            _client.close()
            _client = None

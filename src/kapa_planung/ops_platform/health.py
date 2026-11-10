"""``/health`` and ``/health/metrics`` - the contract the platform monitor reads (MON-01..05).

Response shapes are documented in standards/09-health-and-monitoring.md. Changing a field
name is a breaking change for the monitor: add fields, never rename or remove them.
"""

from __future__ import annotations

import hmac
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Callable

from flask import Blueprint, Flask, g, jsonify, request

from .config import app_environment
from .manifest import AppManifest

HealthCheck = Callable[[], "bool | dict[str, Any]"]

try:  # psutil is in the standard requirements; the endpoint degrades without it.
    import psutil
except ImportError:  # pragma: no cover - depends on the environment
    psutil = None


class RequestMetrics:
    """Counters since process start plus a rolling window of recent latencies."""

    def __init__(self, window: int = 2000) -> None:
        self._lock = threading.Lock()
        self._latencies: deque[float] = deque(maxlen=window)
        self.total = 0
        self.by_status: dict[str, int] = {"2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0}
        self._minute_marks: deque[float] = deque()

    def record(self, status: int, duration_ms: float) -> None:
        now = time.monotonic()
        with self._lock:
            self.total += 1
            bucket = f"{status // 100}xx"
            self.by_status[bucket] = self.by_status.get(bucket, 0) + 1
            self._latencies.append(duration_ms)
            self._minute_marks.append(now)
            while self._minute_marks and self._minute_marks[0] < now - 60:
                self._minute_marks.popleft()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            now = time.monotonic()
            while self._minute_marks and self._minute_marks[0] < now - 60:
                self._minute_marks.popleft()
            ordered = sorted(self._latencies)
            per_minute = len(self._minute_marks)
            total, by_status = self.total, dict(self.by_status)

        def percentile(p: float) -> float | None:
            if not ordered:
                return None
            return round(ordered[min(len(ordered) - 1, int(p * len(ordered)))], 1)

        return {
            "total": total,
            "lastMinute": per_minute,
            "byStatus": by_status,
            "latencyMs": {"p50": percentile(0.5), "p95": percentile(0.95), "max": round(ordered[-1], 1) if ordered else None},
            "latencyWindow": {"kind": "recentRequests", "count": len(ordered), "limit": self._latencies.maxlen},
        }


class HealthRegistry:
    def __init__(self, manifest: AppManifest, design_system_version: Callable[[], str]) -> None:
        self.manifest = manifest
        self.started_at = datetime.now(timezone.utc)
        self._started_monotonic = time.monotonic()
        self._checks: dict[str, HealthCheck] = {}
        self._critical: set[str] = set()
        self._design_system_version = design_system_version
        self.requests = RequestMetrics()
        self.database_stats: Callable[[], dict[str, Any] | None] | None = None
        self._process = psutil.Process() if psutil is not None else None
        self._process_lock = threading.Lock()
        self._cpu_primed = False

    def add_check(self, name: str, check: HealthCheck, *, critical: bool = False) -> None:
        """Register a cheap check. ``critical`` checks turn /health into 503 when they fail."""
        self._checks[name] = check
        if critical:
            self._critical.add(name)

    def _run_checks(self) -> tuple[bool, dict[str, Any]]:
        ok, results = True, {}
        for name, check in self._checks.items():
            try:
                value = check()
            except Exception as exc:  # a failing check must never break the endpoint
                value = {"ok": False, "error": type(exc).__name__}
            result = value if isinstance(value, dict) else {"ok": bool(value)}
            results[name] = result
            if name in self._critical and not result.get("ok", False):
                ok = False
        return ok, results

    def health_payload(self) -> tuple[dict[str, Any], int]:
        ok, checks = self._run_checks()
        payload = {
            "ok": ok,
            "appId": self.manifest.app_id,
            "name": self.manifest.name,
            "version": self.manifest.version,
            "environment": app_environment(),
            "startedAt": self.started_at.isoformat(),
            "uptimeSeconds": int(time.monotonic() - self._started_monotonic),
            "standardVersion": self.manifest.standard_version,
            "designSystemVersion": self._design_system_version(),
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return payload, 200 if ok else 503

    def metrics_payload(self) -> dict[str, Any]:
        process: dict[str, Any] | None = None
        if self._process is not None:
            proc = self._process
            with self._process_lock, proc.oneshot():
                cpu = proc.cpu_percent(interval=None)
                process = {
                    "pid": proc.pid,
                    "cpuPercent": cpu if self._cpu_primed else None,
                    "rssMB": round(proc.memory_info().rss / (1024 * 1024), 1),
                    "threads": proc.num_threads(),
                }
                self._cpu_primed = True
        return {
            "appId": self.manifest.app_id,
            "environment": app_environment(),
            "uptimeSeconds": int(time.monotonic() - self._started_monotonic),
            "requests": self.requests.snapshot(),
            "process": process,
            "database": self.database_stats() if self.database_stats else None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


def init_health(app: Flask, registry: HealthRegistry) -> None:
    blueprint = Blueprint("ops_health", __name__)

    @blueprint.get("/health")
    def health():  # type: ignore[no-untyped-def]
        payload, status = registry.health_payload()
        return jsonify(payload), status

    @blueprint.get("/health/metrics")
    def metrics():  # type: ignore[no-untyped-def]
        token = os.getenv("MONITORING_TOKEN", "")
        if token and not hmac.compare_digest(request.headers.get("X-Monitoring-Token", ""), token):
            return jsonify({"error": "forbidden"}), 403
        return jsonify(registry.metrics_payload())

    app.register_blueprint(blueprint)

    @app.before_request
    def _start_timer() -> None:
        g._ops_request_started = time.perf_counter()

    @app.after_request
    def _record(response):  # type: ignore[no-untyped-def]
        started = g.pop("_ops_request_started", None)
        if started is not None and not request.path.startswith("/health"):
            registry.requests.record(response.status_code, (time.perf_counter() - started) * 1000)
        return response

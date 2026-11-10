"""Waitress host with background workers and one idempotent stop path (DEP-01, LOG-04..06).

Start order: workers, then HTTP server. Stop order: HTTP server, then workers in reverse.
Console mode (``run_console``) and the Windows service drive the same ``AppHost``.
"""

from __future__ import annotations

import logging
import signal
import threading
from typing import Callable, Protocol, Sequence

from flask import Flask
from waitress.server import create_server
from .config import env_int

log = logging.getLogger("ops_platform.host")


class BackgroundWorker(Protocol):
    name: str

    def start(self) -> None: ...

    def stop(self) -> None: ...


class AppHost:
    def __init__(
        self,
        app: Flask,
        *,
        host: str,
        port: int,
        threads: int = 8,
        workers: Sequence[BackgroundWorker] = (),
        on_stopped: Callable[[], None] | None = None,
    ) -> None:
        self.host, self.port = host, port
        self._workers = list(workers)
        self._on_stopped = on_stopped
        # ProxyFix owns header trust/counting. Waitress 3 otherwise removes these
        # headers before ProxyFix can recover the public origin from IIS/ARR.
        self._server = create_server(app, host=host, port=port, threads=threads,
            clear_untrusted_proxy_headers=env_int("TRUSTED_PROXY_HOPS", 1) == 0)
        self._thread = threading.Thread(target=self._run, name="waitress", daemon=False)
        self._stop_lock = threading.Lock()
        self._stopping = False

    def start(self) -> None:
        for worker in self._workers:
            log.info("starting worker %s", worker.name)
            worker.start()
        self._thread.start()
        log.info("listening on http://%s:%s", self.host, self.port)

    def _run(self) -> None:
        try:
            self._server.run()
        except OSError as exc:
            # Closing the listening socket from another thread makes Waitress raise
            # WinError 10038 on Windows. Expected during our own stop, a crash otherwise.
            code = getattr(exc, "winerror", None) or getattr(exc, "errno", None)
            if self._stopping and code == 10038:
                return
            raise

    def stop(self) -> None:
        with self._stop_lock:
            if self._stopping:
                return
            self._stopping = True
        log.info("stopping HTTP server")
        for channel in list((getattr(self._server, "active_channels", {}) or {}).values()):
            close = getattr(channel, "close", None)
            if callable(close):
                close()
        self._server.close()
        dispatcher = getattr(self._server, "task_dispatcher", None)
        if dispatcher is not None:
            dispatcher.shutdown()
        self._thread.join(timeout=10)
        for worker in reversed(self._workers):
            log.info("stopping worker %s", worker.name)
            try:
                worker.stop()
            except Exception:
                log.exception("worker %s failed to stop cleanly", worker.name)
        if self._on_stopped:
            self._on_stopped()
        log.info("stopped")

    def is_alive(self) -> bool:
        return self._thread.is_alive()

    def join(self, timeout: float | None = None) -> None:
        self._thread.join(timeout=timeout)


def run_console(build_host: Callable[[], AppHost], app_name: str) -> int:
    """Foreground run for development and ``start.bat`` without a service: Ctrl+C stops cleanly."""
    host = build_host()
    stop_requested = threading.Event()

    def request_stop(*_: object) -> None:
        stop_requested.set()

    for name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        sig = getattr(signal, name, None)
        if sig is not None:
            signal.signal(sig, request_stop)

    print(f"Starting {app_name} on http://{host.host}:{host.port} - press Ctrl+C to stop.")
    host.start()
    try:
        while host.is_alive() and not stop_requested.is_set():
            host.join(timeout=0.5)
    finally:
        host.stop()
    return 0

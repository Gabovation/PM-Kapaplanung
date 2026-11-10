"""Helpers the standard .bat scripts call (RUN-01..08). Run as

    python -m <package>.ops_platform.cli --root <project> <command>

Commands: check-env, info, status, wait-healthy, start-background, stop-background.
"""

from __future__ import annotations

import argparse
import json
import os
# Only fixed system commands and the app's own interpreter are started.
import subprocess  # nosec B404
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import dotenv_values

from .config import validate_env_file
from .manifest import load_manifest

PID_FILE = Path("logs") / "app.pid"


def _port(root: Path) -> int:
    values = dotenv_values(root / ".env")
    raw = (values.get("APP_PORT") or "").strip()
    return int(raw) if raw.isdigit() else load_manifest(root).default_port


def _health_url(root: Path) -> str:
    host = (dotenv_values(root / ".env").get("APP_HOST") or "").strip()
    # An app bound to its LAN address (proxy on another server, DEP-03) does not answer on
    # 127.0.0.1; a wildcard bind does. The wildcard addresses are compared here, not bound.
    if host in ("", "0.0.0.0", "::", "localhost"):  # nosec B104
        host = "127.0.0.1"
    if ":" in host:
        host = f"[{host}]"
    return f"http://{host}:{_port(root)}/health"


def _fetch_health(root: Path, timeout: float = 5.0) -> tuple[int | None, dict | None]:
    url = _health_url(root)
    try:
        # http URL built from the server's own .env (APP_HOST) and an integer port.
        with urllib.request.urlopen(url, timeout=timeout) as response:  # nosec B310
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode("utf-8"))
        except ValueError:
            return exc.code, None
    except (urllib.error.URLError, OSError, ValueError):
        return None, None


def _pid_alive(pid: int) -> bool:
    if os.name == "nt":
        # Fixed Windows system command; the PID is an integer.
        result = subprocess.run(  # nosec B603, B607
            ["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True, check=False
        )
        return str(pid) in result.stdout
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def cmd_check_env(root: Path) -> int:
    problems = validate_env_file(root)
    for problem in problems:
        print(f"ERROR: {problem}")
    if not problems:
        print(".env validation passed.")
    return 1 if problems else 0


def cmd_info(root: Path) -> int:
    manifest = load_manifest(root)
    print(f"{manifest.name} ({manifest.app_id}) {manifest.version} - service {manifest.service_name}, "
          f"path {manifest.path}, port {_port(root)}, standard {manifest.standard_version}")
    return 0


def cmd_status(root: Path) -> int:
    cmd_info(root)
    status, payload = _fetch_health(root)
    if status is None:
        print("Health: not reachable (app is not running or listens on another port).")
        return 1
    print(f"Health: HTTP {status}")
    if payload:
        for key in ("ok", "version", "environment", "uptimeSeconds", "designSystemVersion", "checks"):
            print(f"  {key}: {payload.get(key)}")
    return 0 if status == 200 else 1


def cmd_wait_healthy(root: Path, timeout: float) -> int:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status, _ = _fetch_health(root, timeout=3)
        if status == 200:
            print("Health check passed.")
            return 0
        time.sleep(2)
    print(f"ERROR: /health did not return 200 within {int(timeout)} s - check logs\\app.log.")
    return 1


def cmd_start_background(root: Path) -> int:
    pid_file = root / PID_FILE
    if pid_file.exists():
        pid = int(pid_file.read_text(encoding="ascii").strip() or 0)
        if pid and _pid_alive(pid):
            print(f"Already running with PID {pid}. Use stop.bat first.")
            return 0
        pid_file.unlink()
    pid_file.parent.mkdir(exist_ok=True)
    log = (root / "logs" / "console.log").open("a", encoding="utf-8")
    flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
    # Fixed interpreter and entry point of this app.
    process = subprocess.Popen(  # nosec B603
        [sys.executable, str(root / "main.py")], cwd=str(root), stdout=log, stderr=subprocess.STDOUT, creationflags=flags
    )
    pid_file.write_text(str(process.pid), encoding="ascii")
    print(f"Started in background with PID {process.pid}. Log: logs\\console.log")
    return 0


def cmd_stop_background(root: Path) -> int:
    pid_file = root / PID_FILE
    if not pid_file.exists():
        print("No background process recorded (logs\\app.pid missing).")
        return 0
    pid = int(pid_file.read_text(encoding="ascii").strip() or 0)
    if pid and _pid_alive(pid):
        # A detached process has no console to receive Ctrl+C, so the tree is terminated.
        # Fixed Windows system command; the PID is an integer.
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, check=False)  # nosec B603, B607
        time.sleep(1)
        if _pid_alive(pid):
            print(f"ERROR: process {pid} could not be stopped.")
            return 1
        print(f"Stopped PID {pid}.")
    else:
        print("Recorded process is no longer running; removing stale PID file.")
    pid_file.unlink()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("command", choices=["check-env", "info", "status", "wait-healthy", "start-background", "stop-background"])
    parser.add_argument("--timeout", type=float, default=60.0)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    handlers = {
        "check-env": lambda: cmd_check_env(root),
        "info": lambda: cmd_info(root),
        "status": lambda: cmd_status(root),
        "wait-healthy": lambda: cmd_wait_healthy(root, args.timeout),
        "start-background": lambda: cmd_start_background(root),
        "stop-background": lambda: cmd_stop_background(root),
    }
    return handlers[args.command]()


if __name__ == "__main__":
    sys.exit(main())

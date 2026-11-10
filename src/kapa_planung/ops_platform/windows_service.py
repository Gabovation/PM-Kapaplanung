"""Base class for the app's Windows service (DEP-02). Requires pywin32.

The app keeps a tiny ``src/<package>/windows_service.py`` that subclasses ``PlatformService``
- the class must live in the app's own module because the service registry stores its
import path.
"""

from __future__ import annotations

import logging
import os
import sys
import sysconfig
import traceback
from pathlib import Path
from typing import Any

from .logging_setup import configure_logging

try:
    import servicemanager
    import win32event
    import win32service
    import win32serviceutil

    AVAILABLE = True
except ImportError:  # non-Windows development machines
    AVAILABLE = False

log = logging.getLogger("ops_platform.service")

SERVICE_ACTIONS_WITH_REGISTRATION = {"install", "update"}


def service_environment() -> list[str]:
    """Environment the Windows service needs to find the app's packages.

    pythonservice.exe starts the base interpreter without the venv's site-packages, so the service
    fails with "No module named 'servicemanager'" (error 1053) before any app code or log runs.
    PYTHONPATH does not apply .pth files, so pywin32's own folders are listed explicitly.
    """
    site = Path(sysconfig.get_paths()["purelib"])
    return ["PYTHONPATH=" + os.pathsep.join(str(path) for path in (site, site / "win32", site / "win32" / "lib"))]


if AVAILABLE:

    class PlatformService(win32serviceutil.ServiceFramework):
        project_root: Path

        def build_host(self) -> Any:  # returns ops_platform.server_host.AppHost
            raise NotImplementedError

        def __init__(self, args: Any) -> None:
            super().__init__(args)
            self._stop_event = win32event.CreateEvent(None, 0, 0, None)
            self._host: Any = None

        def SvcStop(self) -> None:
            self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
            win32event.SetEvent(self._stop_event)

        def SvcDoRun(self) -> None:
            configure_logging(self.project_root, "windows-service.log")
            try:
                self._host = self.build_host()
                self._host.start()
                # Report RUNNING only once Waitress is actually listening (LOG-05).
                self.ReportServiceStatus(win32service.SERVICE_RUNNING)
                servicemanager.LogInfoMsg(f"{self._svc_name_} listening on {self._host.host}:{self._host.port}")
                while self._host.is_alive():
                    if win32event.WaitForSingleObject(self._stop_event, 500) == win32event.WAIT_OBJECT_0:
                        break
            except Exception:
                details = traceback.format_exc()
                log.error("service failed\n%s", details)
                servicemanager.LogErrorMsg(f"{self._svc_name_} failed:\n{details}")
                raise
            finally:
                if self._host is not None:
                    self._host.stop()
                servicemanager.LogInfoMsg(f"{self._svc_name_} stopped")

    def handle_command_line(service_class: type) -> None:
        win32serviceutil.HandleCommandLine(service_class)
        if SERVICE_ACTIONS_WITH_REGISTRATION & set(sys.argv[1:]):
            import winreg

            key = rf"SYSTEM\CurrentControlSet\Services\{service_class._svc_name_}"
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key, 0, winreg.KEY_SET_VALUE) as handle:
                winreg.SetValueEx(handle, "Environment", 0, winreg.REG_MULTI_SZ, service_environment())
            print(f"Service environment set: {service_environment()[0]}")

else:

    class PlatformService:  # type: ignore[no-redef]
        project_root: Path

    def handle_command_line(service_class: type) -> None:
        raise RuntimeError("Windows service support requires pywin32 on Windows")

@rem App-specific values for the standard .bat scripts (RUN-02). The .bat files themselves
@rem are identical in every app - change behaviour in gma-app-standards, not here.
set "APP_PACKAGE=kapa_planung"
set "SERVICE_NAME=KapazitTsplanung"
set "VENV_PY=%ROOT%\.venv\Scripts\python.exe"
set "PYTHONPATH=%ROOT%\src"
set "OPS="%VENV_PY%" -m %APP_PACKAGE%.ops_platform.cli --root "%ROOT%""
@rem Windows tools by full path: Git/MSYS ships its own find/timeout that would win on PATH.
set "SC=%SystemRoot%\System32\sc.exe"
set "FIND=%SystemRoot%\System32\find.exe"
set "TIMEOUT=%SystemRoot%\System32\timeout.exe"

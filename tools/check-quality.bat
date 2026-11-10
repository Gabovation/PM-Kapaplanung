@echo off
rem Quality gate (QA-01..05): tests with coverage, bandit, pip-audit, platform conformance.
setlocal EnableExtensions
set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "VENV_PY=%ROOT%\.venv\Scripts\python.exe"
if not defined GMA_APP_STANDARDS_PATH set "GMA_APP_STANDARDS_PATH=C:\GitHub\gma-app-standards"

"%VENV_PY%" -m pip install -q -r "%ROOT%\requirements-dev.txt" || exit /b 1
"%VENV_PY%" -m pytest || exit /b 1
"%VENV_PY%" -m bandit -q -r "%ROOT%\src" -c "%ROOT%\pyproject.toml" || exit /b 1
"%VENV_PY%" -m pip_audit -r "%ROOT%\requirements.txt" || exit /b 1
"%VENV_PY%" "%GMA_APP_STANDARDS_PATH%\tools\platform_check.py" "%ROOT%" || exit /b 1
echo Quality gate passed.

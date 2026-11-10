@echo off
rem POLYTEC Operations Platform standard script (RUN-01, RUN-03). Safe to re-run.
rem   install.bat                 create .venv, install requirements, validate .env
rem   install.bat service         additionally register/refresh the Windows service (elevated)
rem   install.bat remove-service  stop and unregister the Windows service (elevated)
setlocal EnableExtensions
set "ROOT=%~dp0."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
call "%ROOT%\scripts\app.cmd"

if /I "%~1"=="remove-service" goto :remove_service

if not exist "%VENV_PY%" (
  echo Creating virtual environment...
  where py >nul 2>&1 && (py -3 -m venv "%ROOT%\.venv") || (python -m venv "%ROOT%\.venv")
)
if not exist "%VENV_PY%" (echo ERROR: could not create .venv - is Python 3.11+ installed and on PATH? & exit /b 1)
"%VENV_PY%" -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" || (echo ERROR: Python 3.11 or newer is required. & exit /b 1)

"%VENV_PY%" -m pip install --upgrade pip || exit /b 1
"%VENV_PY%" -m pip install -r "%ROOT%\requirements.txt" || exit /b 1
"%VENV_PY%" -m pip check || exit /b 1
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"

if not exist "%ROOT%\.env" (
  copy "%ROOT%\.env.example" "%ROOT%\.env" >nul
  echo Created .env from .env.example. Fill in real values, then run install.bat again.
  exit /b 1
)
%OPS% check-env || exit /b 1

if /I "%~1"=="service" goto :service
echo Install complete. Start with start.bat, or run "install.bat service" as administrator for the Windows service.
exit /b 0

:service
net session >nul 2>&1 || (echo ERROR: "install.bat service" needs an elevated prompt. & exit /b 1)
"%SC%" query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (set "SERVICE_ACTION=install") else (set "SERVICE_ACTION=update")
"%VENV_PY%" "%ROOT%\src\%APP_PACKAGE%\windows_service.py" --startup auto %SERVICE_ACTION% || exit /b 1
echo Service %SERVICE_NAME% registered (automatic start).
echo Set the dedicated service account once (DEP-04):  sc config "%SERVICE_NAME%" obj= "DOMAIN\account" password= "..."
exit /b 0

:remove_service
net session >nul 2>&1 || (echo ERROR: "install.bat remove-service" needs an elevated prompt. & exit /b 1)
call "%ROOT%\stop.bat"
"%VENV_PY%" "%ROOT%\src\%APP_PACKAGE%\windows_service.py" remove
exit /b %ERRORLEVEL%

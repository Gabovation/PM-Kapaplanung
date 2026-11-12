@echo off
rem POLYTEC Operations Platform standard script (RUN-01, RUN-04).
rem   start.bat             service if registered, otherwise foreground console (Ctrl+C stops)
rem   start.bat background  service if registered, otherwise detached console process
rem Returns only after /health answers 200 (service and background modes).
rem Lokale Abweichung von RUN-02: Doppelklick startet ohne Plattformumgebung die Vorführung.
setlocal EnableExtensions
set "ROOT=%~dp0."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
call "%ROOT%\scripts\app.cmd"

rem Lokale Vorführung: Doppelklick ohne Plattformumgebung startet den lokalen Launcher.
if "%~1"=="" if not exist "%VENV_PY%" goto :local
if "%~1"=="" if not exist "%ROOT%\.env" goto :local
if /I "%~1"=="--no-browser" if not exist "%VENV_PY%" goto :local
if /I "%~1"=="--no-browser" if not exist "%ROOT%\.env" goto :local
if not exist "%VENV_PY%" (echo ERROR: .venv is missing - run install.bat first. & exit /b 1)
%OPS% check-env || exit /b 1

"%SC%" query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 goto :service
if /I "%~1"=="background" goto :background

"%VENV_PY%" "%ROOT%\main.py"
exit /b %ERRORLEVEL%

:service
"%SC%" query "%SERVICE_NAME%" | "%FIND%" "RUNNING" >nul
if errorlevel 1 "%SC%" start "%SERVICE_NAME%" >nul
if errorlevel 1 (echo ERROR: could not start service %SERVICE_NAME%. & exit /b 1)
%OPS% wait-healthy --timeout 90
exit /b %ERRORLEVEL%

:background
%OPS% start-background || exit /b 1
%OPS% wait-healthy --timeout 60
exit /b %ERRORLEVEL%

:local
chcp 65001 >nul
set "PYTHONUTF8=1"
if not exist "%ROOT%\local_launcher.py" (
  echo Das lokale Startprogramm local_launcher.py wurde nicht gefunden.
  pause
  exit /b 1
)
python.exe -c "import sys; sys.exit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto :local_python
py.exe -3 -c "import sys; sys.exit(sys.version_info < (3, 11))" >nul 2>&1
if not errorlevel 1 goto :local_py
echo Python 3.11 oder neuer wurde nicht gefunden. Bitte Python installieren.
pause
exit /b 1

:local_python
python.exe "%ROOT%\local_launcher.py" %*
exit /b %ERRORLEVEL%

:local_py
py.exe -3 "%ROOT%\local_launcher.py" %*
exit /b %ERRORLEVEL%

@echo off
rem POLYTEC Operations Platform standard script (RUN-01, RUN-05).
rem Stops the Windows service (graceful SvcStop) or the background process started by
rem "start.bat background". A foreground console is stopped with Ctrl+C in its own window.
setlocal EnableExtensions
set "ROOT=%~dp0."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
call "%ROOT%\scripts\app.cmd"

"%SC%" query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 goto :service
if not exist "%VENV_PY%" (echo Nothing to stop: no service and no .venv. & exit /b 0)
%OPS% stop-background
exit /b %ERRORLEVEL%

:service
"%SC%" query "%SERVICE_NAME%" | "%FIND%" "STOPPED" >nul
if not errorlevel 1 (echo Service %SERVICE_NAME% is already stopped. & exit /b 0)
"%SC%" stop "%SERVICE_NAME%" >nul || (echo ERROR: could not stop %SERVICE_NAME%. & exit /b 1)
for /l %%I in (1,1,30) do (
  "%SC%" query "%SERVICE_NAME%" | "%FIND%" "STOPPED" >nul && (echo Service %SERVICE_NAME% stopped. & exit /b 0)
  "%TIMEOUT%" /t 1 /nobreak >nul
)
echo ERROR: %SERVICE_NAME% did not stop within 30 seconds.
exit /b 1

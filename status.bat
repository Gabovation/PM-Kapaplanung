@echo off
rem POLYTEC Operations Platform standard script (RUN-07): identity, service state and /health.
setlocal EnableExtensions
set "ROOT=%~dp0."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
call "%ROOT%\scripts\app.cmd"

if not exist "%VENV_PY%" (echo ERROR: .venv is missing - run install.bat first. & exit /b 1)
"%SC%" query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (echo Service %SERVICE_NAME%: not registered) else ("%SC%" query "%SERVICE_NAME%" | "%FIND%" "STATE")
%OPS% status
exit /b %ERRORLEVEL%

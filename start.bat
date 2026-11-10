@echo off
rem POLYTEC Operations Platform standard script (RUN-01, RUN-04).
rem   start.bat             service if registered, otherwise foreground console (Ctrl+C stops)
rem   start.bat background  service if registered, otherwise detached console process
rem Returns only after /health answers 200 (service and background modes).
setlocal EnableExtensions
set "ROOT=%~dp0."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
call "%ROOT%\scripts\app.cmd"

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

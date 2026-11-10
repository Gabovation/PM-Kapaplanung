@echo off
rem POLYTEC Operations Platform standard script (RUN-01, RUN-06).
rem   update.bat        git pull --ff-only, refresh requirements, restart if running, verify /health
rem   update.bat force  same, even when the commit did not change
setlocal EnableExtensions

rem git pull can rewrite this file while cmd.exe is still reading it by byte offset, so the
rem real work runs from a temporary copy. Control never returns to this file.
if /I "%~1"=="--from-copy" goto :main
del /q "%TEMP%\polytec-ops-update-*.bat" 2>nul
set "SELF_COPY=%TEMP%\polytec-ops-update-%RANDOM%%RANDOM%.bat"
copy /y "%~f0" "%SELF_COPY%" >nul || (echo ERROR: cannot copy the update script to %TEMP%. & exit /b 1)
"%SELF_COPY%" --from-copy "%~dp0." %1

:main
for %%I in ("%~2") do set "ROOT=%%~fI"
set "MODE=%~3"
call "%ROOT%\scripts\app.cmd"

if not exist "%VENV_PY%" (echo ERROR: .venv is missing - run install.bat first. & goto :done_error)
where git >nul 2>&1 || (echo ERROR: git is not on PATH. & goto :done_error)

set "DIRTY="
for /f "delims=" %%A in ('git -C "%ROOT%" status --porcelain -uno') do set "DIRTY=1"
if defined DIRTY (
  echo ERROR: tracked files were changed on this server. A server must match the repository -
  echo        commit the change from a workstation, or discard it, then run update.bat again.
  goto :done_error
)

for /f "delims=" %%A in ('git -C "%ROOT%" rev-parse --short HEAD') do set "PREVIOUS=%%A"
git -C "%ROOT%" pull --ff-only || goto :done_error
for /f "delims=" %%A in ('git -C "%ROOT%" rev-parse --short HEAD') do set "CURRENT=%%A"
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"
>>"%ROOT%\logs\update.log" echo %DATE% %TIME% %PREVIOUS% -^> %CURRENT%
if "%PREVIOUS%"=="%CURRENT%" if /I not "%MODE%"=="force" (echo Already up to date at %CURRENT%. & goto :done_ok)

"%VENV_PY%" -m pip install -r "%ROOT%\requirements.txt" || goto :failed
"%VENV_PY%" -m pip check || goto :failed
%OPS% check-env || goto :failed

"%SC%" query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 goto :restart
if exist "%ROOT%\logs\app.pid" goto :restart
echo Updated %PREVIOUS% -^> %CURRENT%. The app was not running; start it with start.bat.
goto :done_ok

:restart
call "%ROOT%\stop.bat" || goto :failed
call "%ROOT%\start.bat" background || goto :failed
echo Updated %PREVIOUS% -^> %CURRENT%, restarted, health check passed.
goto :done_ok

:failed
echo ERROR: update %PREVIOUS% -^> %CURRENT% failed.
echo To roll back:  git -C "%ROOT%" reset --hard %PREVIOUS%  then  install.bat  and  start.bat
goto :done_error

:done_ok
exit /b 0

:done_error
exit /b 1

@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-server.ps1"
if errorlevel 1 (
    echo.
    echo UBTS-Link could not be started. See the error above.
    pause
)

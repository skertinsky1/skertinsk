@echo off
title Roulette Bot
cd /d "%~dp0"

echo.
echo   Starting the bot...
echo.

where node >nul 2>nul
if errorlevel 1 goto portable

echo   Node found in system.
echo.
node "src\index.js"
goto end

:portable
set "NODE_EXE=%LOCALAPPDATA%\Temp\node\node-v24.21.0-win-x64\node.exe"
if not exist "%NODE_EXE%" goto nonode
echo   Using portable Node.
echo.
"%NODE_EXE%" "src\index.js"
goto end

:nonode
echo   ERROR: Node not found.
echo.
echo   Install it from:  https://nodejs.org/
echo   (choose Node.js LTS for Windows, normal install)
echo.
pause
exit /b 1

:end
echo.
echo   Bot stopped.
pause

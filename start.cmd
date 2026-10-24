@echo off
cd /d "%~dp0"
start "" http://localhost:8757/emulator
node server.mjs
pause

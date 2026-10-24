@echo off
cd /d "%~dp0"
set "PATH=%~dp0..\.tools\xtensa-official\xtensa-esp-elf\bin;%PATH%"
..\.tools\pio\Scripts\platformio.exe run
pause

@echo off
netsh advfirewall firewall add rule name="ArenaTimer Simulator 8757-8758" dir=in action=allow protocol=TCP localport=8757-8758 remoteip=localsubnet profile=any
if errorlevel 1 (
  echo Right-click this file and choose Run as administrator.
) else (
  echo Local network access enabled on TCP ports 8757 and 8758.
)
pause

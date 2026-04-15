@echo off
setlocal
set "BIN=%~dp0bin"
set "PATH=%BIN%;%PATH%"
"%BIN%\pg_restore.exe" %*

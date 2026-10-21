@echo off
chcp 65001 >nul
cd /d "%~dp0"
docker compose -f deploy\docker-compose.local.yml stop
echo.
echo  Gestoppt. Deine Daten bleiben erhalten - "Lokal-starten.bat" startet wieder.
echo.
pause

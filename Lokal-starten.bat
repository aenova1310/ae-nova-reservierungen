@echo off
chcp 65001 >nul
cd /d "%~dp0"
title A^&E NOVA Reservierungen - lokal
echo.
echo  A^&E NOVA Reservierungen - lokale Vorschau
echo  ==========================================
echo.
docker info >nul 2>&1
if errorlevel 1 (
  echo  Docker Desktop laeuft nicht.
  echo  Bitte Docker Desktop starten, warten bis unten links "Engine running" steht,
  echo  und dieses Fenster dann erneut starten.
  echo.
  pause
  exit /b 1
)
echo  Starte ... beim ersten Mal dauert das 5-10 Minuten.
echo.
docker compose -f deploy\docker-compose.local.yml up -d --build
if errorlevel 1 (
  echo.
  echo  Fehler beim Starten. Bitte den Text oben kopieren und an Claude schicken.
  pause
  exit /b 1
)
echo.
echo  Warte, bis die App bereit ist ...
:warten
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:3000/admin/login | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  timeout /t 3 /nobreak >nul
  goto warten
)
start "" http://localhost:3000/r/pastahaus
start "" http://localhost:3000/admin
echo.
echo  Fertig! Im Browser sind zwei Tabs aufgegangen:
echo.
echo    Gaeste-Buchung:  http://localhost:3000/r/pastahaus
echo    Verwaltung:      http://localhost:3000/admin
echo.
echo    Inhaber:       inhaber@pastahaus.de   /  pastahaus-demo
echo    Mitarbeiter:   service@pastahaus.de   /  pastahaus-demo
echo    Super-Admin:   admin@ae-nova.de       /  nova-superadmin
echo.
echo  Beenden: "Lokal-stoppen.bat" doppelklicken.
echo.
pause

#!/bin/sh
# Lokale Vorschau (Mac/Linux): im Terminal im Projektordner  sh lokal-starten.sh
cd "$(dirname "$0")" || exit 1
printf '\n  A&E NOVA Reservierungen – lokale Vorschau\n\n'
if ! docker info >/dev/null 2>&1; then
  echo "  Docker Desktop läuft nicht. Bitte starten, kurz warten und erneut ausführen."
  exit 1
fi
echo "  Starte … beim ersten Mal dauert das 5–10 Minuten."
docker compose -f deploy/docker-compose.local.yml up -d --build || { echo "  Fehler – bitte die Ausgabe an Claude schicken."; exit 1; }
printf '  Warte, bis die App bereit ist '
until curl -fs -o /dev/null http://localhost:3000/admin/login; do printf '.'; sleep 3; done
echo
if command -v open >/dev/null; then open http://localhost:3000/r/pastahaus; open http://localhost:3000/admin
elif command -v xdg-open >/dev/null; then xdg-open http://localhost:3000/admin >/dev/null 2>&1; fi
cat <<'TXT'

  Fertig!
    Gäste-Buchung:  http://localhost:3000/r/pastahaus
    Verwaltung:     http://localhost:3000/admin

    Inhaber:       inhaber@pastahaus.de   /  pastahaus-demo
    Mitarbeiter:   service@pastahaus.de   /  pastahaus-demo
    Super-Admin:   admin@ae-nova.de       /  nova-superadmin

  Beenden:  sh lokal-stoppen.sh

TXT

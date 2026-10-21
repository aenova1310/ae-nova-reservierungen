#!/bin/sh
cd "$(dirname "$0")" || exit 1
docker compose -f deploy/docker-compose.local.yml stop
echo "  Gestoppt. Daten bleiben erhalten – 'sh lokal-starten.sh' startet wieder."

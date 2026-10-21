#!/usr/bin/env bash
# Neuesten Stand holen, bauen, migrieren, neu starten. Als root im Server ausführen.
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)
"${COMPOSE[@]}" --profile tools build
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" run --rm -T migrate </dev/null
"${COMPOSE[@]}" up -d app cron caddy
docker image prune -f >/dev/null
echo "Aktualisiert auf $(git rev-parse --short HEAD) ($BRANCH)."

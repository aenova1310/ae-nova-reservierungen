#!/usr/bin/env bash
# Neuesten Stand holen, bauen, migrieren, neu starten. Als root im Server ausführen.
set -euo pipefail
cd "$(dirname "$0")/.."
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch --quiet origin "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
MODE="$(grep -E '^MODE=' deploy/.env | cut -d= -f2 || true)"
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)
if [ "${MODE:-caddy}" = proxy ]; then COMPOSE+=(-f deploy/docker-compose.proxy.yml); else COMPOSE+=(--profile caddy); fi
"${COMPOSE[@]}" --profile tools build
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" run --rm -T migrate </dev/null
if [ "${MODE:-caddy}" = proxy ]; then "${COMPOSE[@]}" up -d app cron; else "${COMPOSE[@]}" up -d app cron caddy; fi
docker image prune -f >/dev/null
echo "Aktualisiert auf $(git rev-parse --short HEAD) ($BRANCH)."

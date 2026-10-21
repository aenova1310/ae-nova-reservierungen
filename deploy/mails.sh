#!/usr/bin/env bash
# Test-Server ohne Mailversand (RESEND_API_KEY leer): die letzten abgelegten Mails
# anzeigen – z. B. um Links für „Passwort vergessen“ oder Einladungen abzurufen.
#   deploy/mails.sh        → letzte 3 Mails
#   deploy/mails.sh 10     → letzte 10 Mails
set -euo pipefail
cd "$(dirname "$0")/.."
N="${1:-3}"
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T app sh -c \
  "ls -1t .mail-outbox/*.txt 2>/dev/null | head -n $N | while read f; do echo '────────────────────────────────'; cat \"\$f\"; done" \
  || echo "Keine Mails vorhanden."

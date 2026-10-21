#!/bin/sh
# Minimaler Scheduler für die Hintergrundjobs (Alternative: systemd-Timer,
# Coolify Scheduled Tasks oder Vercel Cron). Erwartet CRON_SECRET und TARGET.
set -u
call() { curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" "${TARGET}/api/cron/$1" >/dev/null || echo "cron: $1 fehlgeschlagen"; }
minute=0
while true; do
  call expire-holds
  [ $((minute % 5)) -eq 0 ] && call send-emails
  # täglich gegen 03:00 UTC Anonymisierung und Aufräumen
  if [ "$(date -u +%H%M)" = "0300" ]; then call anonymize; call cleanup; fi
  minute=$((minute + 1))
  sleep 60
done

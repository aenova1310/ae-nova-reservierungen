#!/usr/bin/env bash
# Einrichtung eines Test-Servers für A&E NOVA Reservierungen.
# Getestet für einen frischen Ubuntu-24.04-Server (z. B. Hetzner Cloud CX22), als root ausführen:
#
#   curl -fsSL https://raw.githubusercontent.com/aenova1310/ae-nova-reservierungen/main/deploy/install.sh | bash
#
# Optional vorher setzen:
#   BRANCH=…   Git-Branch (Standard: main)
#   DOMAIN=…   eigene (Sub-)Domain, deren DNS-A-Eintrag auf diesen Server zeigt.
#              Ohne Angabe: <IP>.sslip.io (funktioniert sofort, mit gültigem HTTPS)
#   DEMO=0     keine Demo-Daten (Pastahaus) anlegen
#
# Das Skript ist wiederholbar: vorhandene Geheimnisse in deploy/.env bleiben erhalten.
set -euo pipefail

# Alles in main(): bei `curl … | bash` liest bash so erst das ganze Skript, bevor etwas
# ausgeführt wird – kein Befehl kann versehentlich den Rest des Skripts von stdin lesen.
main() {
REPO="https://github.com/aenova1310/ae-nova-reservierungen.git"
BRANCH="${BRANCH:-main}"
DIR="/opt/ae-nova"
DEMO="${DEMO:-1}"

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen (oder mit sudo)."; exit 1; }

say "Systempakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl ca-certificates ufw >/dev/null

if ! command -v docker >/dev/null; then
  say "Docker installieren"
  curl -fsSL https://get.docker.com | sh
fi

# Next.js-Build braucht Arbeitsspeicher – auf kleinen Servern Auslagerung anlegen
if [ "$(free -m | awk '/Mem:/ {print $2}')" -lt 3500 ] && ! swapon --show | grep -q swapfile; then
  say "2 GB Auslagerungsdatei anlegen"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Firewall: nur SSH, HTTP und HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null
ufw --force enable >/dev/null

say "Code holen ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --quiet origin "$BRANCH"
  git -C "$DIR" checkout --quiet "$BRANCH"
  git -C "$DIR" reset --quiet --hard "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"

ENV_FILE="deploy/.env"
FIRST_INSTALL=0
if [ ! -f "$ENV_FILE" ]; then
  FIRST_INSTALL=1
  IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
  DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
  rand() { openssl rand -base64 "$1" | tr -d '/+=\n' | cut -c1-"$2"; }
  say "Konfiguration anlegen ($ENV_FILE)"
  umask 077
  cat > "$ENV_FILE" <<CONF
# Erzeugt von deploy/install.sh am $(date -u +%Y-%m-%d). Geheim halten!
DOMAIN=$DOMAIN
POSTGRES_PASSWORD=$(rand 32 40)
APP_SECRET=$(rand 64 64)
CRON_SECRET=$(rand 32 40)
# Für echten Mailversand (Passwort vergessen, Einladungen, Gäste-Mails):
# Resend-Konto, Domain in Region eu-west-1 verifizieren, Schlüssel hier eintragen,
# dann deploy/update.sh ausführen. Ohne Schlüssel werden keine Mails verschickt.
RESEND_API_KEY=
EMAIL_FROM="A&E NOVA Reservierungen <reservierung@$DOMAIN>"
# Passwörter der Demo-Zugänge (nur beim ersten Anlegen der Demo-Daten verwendet)
SEED_DEMO_PASSWORD=$(rand 18 14)
SEED_ADMIN_PASSWORD=$(rand 18 16)
CONF
fi

COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE")

say "Bauen (dauert beim ersten Mal einige Minuten)"
"${COMPOSE[@]}" --profile tools build

say "Datenbank starten und migrieren"
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" run --rm -T migrate </dev/null

if [ "$FIRST_INSTALL" = 1 ] && [ "$DEMO" = 1 ]; then
  say "Demo-Daten anlegen"
  "${COMPOSE[@]}" run --rm -T seed </dev/null
fi

say "App, Hintergrundjobs und HTTPS starten"
"${COMPOSE[@]}" up -d app cron caddy

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
say "Warte auf https://$DOMAIN …"
for _ in $(seq 1 60); do
  curl -fsS -o /dev/null "https://$DOMAIN/admin/login" 2>/dev/null && break
  sleep 3
done

cat <<DONE

────────────────────────────────────────────────────────────────────
  A&E NOVA Reservierungen läuft.

  Gäste-Widget:   https://$DOMAIN/r/pastahaus
  Verwaltung:     https://$DOMAIN/admin
DONE
if [ "$FIRST_INSTALL" = 1 ] && [ "$DEMO" = 1 ]; then
  cat <<DONE

  Demo-Zugänge (bitte notieren – stehen auch in $DIR/$ENV_FILE):
    Inhaber:      inhaber@pastahaus.de   /  $SEED_DEMO_PASSWORD
    Mitarbeiter:  service@pastahaus.de   /  $SEED_DEMO_PASSWORD
    Super-Admin:  admin@ae-nova.de       /  $SEED_ADMIN_PASSWORD
DONE
fi
cat <<DONE

  Update:   $DIR/deploy/update.sh
  Logs:     cd $DIR && docker compose -f deploy/docker-compose.yml logs -f app
────────────────────────────────────────────────────────────────────
DONE
}

main "$@"

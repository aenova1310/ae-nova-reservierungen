#!/usr/bin/env bash
# Einrichtung eines Test-Servers für A&E NOVA Reservierungen.
# Getestet für einen frischen Ubuntu-24.04-Server (z. B. Hetzner Cloud CX22), als root ausführen:
#
#   curl -fsSL https://raw.githubusercontent.com/aenova1310/ae-nova-reservierungen/main/deploy/install.sh | bash
#
# Optional vorher setzen:
#   BRANCH=…    Git-Branch (Standard: main)
#   DOMAIN=…    eigene (Sub-)Domain, deren DNS-A-Eintrag auf diesen Server zeigt.
#               Ohne Angabe: <IP>.sslip.io (funktioniert sofort, mit gültigem HTTPS)
#   DEMO=0      keine Demo-Daten (Pastahaus) anlegen
#   APP_PORT=…  nur Modus "proxy": lokaler Port der App (Standard: 3000 bzw. nächster freier)
#
# Auch für Server, die schon in Betrieb sind:
#   - Belegt bereits ein Webserver (nginx, Apache, Plesk …) die Ports 80/443, wird nichts
#     daran geändert: Die App lauscht dann nur lokal, und das Skript zeigt die Weiterleitung,
#     die im vorhandenen Webserver einzutragen ist (Modus "proxy", DOMAIN ist dann Pflicht).
#   - Die Firewall wird nur auf einem frischen Server eingeschaltet; ist ufw schon aktiv,
#     werden lediglich die nötigen Ports freigegeben, sonst bleibt sie unberührt.
#   - Installiert wird nur unter /opt/ae-nova und in Docker (eigenes Netz, eigene Volumes).
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

# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}${ID_LIKE:-}" in
  *ubuntu*|*debian*) ;;
  *) echo "Dieses Skript unterstützt Ubuntu und Debian (gefunden: ${PRETTY_NAME:-unbekannt})."; exit 1 ;;
esac

say "Systempakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl ca-certificates ufw iproute2 >/dev/null

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

# Belegt schon ein anderer Webserver 80/443? (Unser eigener Caddy-Container zählt nicht.)
port_used_by_other() {
  ss -Hltnp "sport = :$1" 2>/dev/null | grep -v -e docker-proxy -e '"caddy"' | grep -q .
}
MODE_DETECTED=caddy
if port_used_by_other 80 || port_used_by_other 443; then MODE_DETECTED=proxy; fi

if ufw status 2>/dev/null | grep -q "Status: active"; then
  if [ "$MODE_DETECTED" = caddy ]; then
    say "Firewall ist aktiv – Ports 80/443 freigeben"
    ufw allow 80/tcp >/dev/null && ufw allow 443 >/dev/null
  fi
elif [ "$(ss -Hltn | awk '{print $4}' | grep -v -E '^(127\.|\[::1\]|localhost)' | grep -v -E ':(22)$' | wc -l)" -eq 0 ]; then
  say "Firewall einschalten: nur SSH, HTTP und HTTPS"
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443 >/dev/null
  ufw --force enable >/dev/null
else
  say "Firewall: unverändert (auf dem Server laufen bereits andere Dienste)"
fi

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
  DOMAIN_SET="${DOMAIN:-}"
  DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
  rand() { openssl rand -base64 "$1" | tr -d '/+=\n' | cut -c1-"$2"; }
  MODE="$MODE_DETECTED"
  if [ "$MODE" = proxy ]; then
    if [ -z "${DOMAIN_SET:-}" ]; then
      cat <<HINT

Auf diesem Server belegt bereits ein Webserver die Ports 80/443 (z. B. nginx, Apache, Plesk).
Daran ändert das Skript nichts. Bitte eine (Sub-)Domain für die App angeben, deren DNS-Eintrag
auf diesen Server zeigt, und das Skript erneut starten, z. B.:

  curl -fsSL …/install.sh | DOMAIN=reservierung.ihre-domain.de BRANCH=$BRANCH bash

HINT
      exit 1
    fi
    APP_PORT="${APP_PORT:-3000}"
    while ss -Hltn "sport = :$APP_PORT" | grep -q .; do APP_PORT=$((APP_PORT + 1)); done
  fi
  say "Konfiguration anlegen ($ENV_FILE)"
  umask 077
  cat > "$ENV_FILE" <<CONF
# Erzeugt von deploy/install.sh am $(date -u +%Y-%m-%d). Geheim halten!
DOMAIN=$DOMAIN
# caddy = eigener HTTPS-Webserver auf 80/443 · proxy = vorhandener Webserver leitet auf 127.0.0.1:APP_PORT weiter
MODE=$MODE
APP_PORT=${APP_PORT:-3000}
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

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
MODE="${MODE:-caddy}"
COMPOSE=(docker compose -f deploy/docker-compose.yml --env-file "$ENV_FILE")
if [ "$MODE" = proxy ]; then COMPOSE+=(-f deploy/docker-compose.proxy.yml); else COMPOSE+=(--profile caddy); fi

say "Bauen (dauert beim ersten Mal einige Minuten)"
"${COMPOSE[@]}" --profile tools build

say "Datenbank starten und migrieren"
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" run --rm -T migrate </dev/null

if [ "$FIRST_INSTALL" = 1 ] && [ "$DEMO" = 1 ]; then
  say "Demo-Daten anlegen"
  "${COMPOSE[@]}" run --rm -T seed </dev/null
fi

say "App und Hintergrundjobs starten"
if [ "$MODE" = proxy ]; then
  "${COMPOSE[@]}" up -d app cron
  cat <<PROXY

────────────────────────────────────────────────────────────────────
  Noch ein Schritt: im vorhandenen Webserver die Domain $DOMAIN
  (mit HTTPS-Zertifikat) an http://127.0.0.1:$APP_PORT weiterleiten.

  nginx (Server-Block für $DOMAIN, Zertifikat z. B. mit certbot):
      location / {
          proxy_pass http://127.0.0.1:$APP_PORT;
          proxy_set_header Host \$host;
          proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto https;
          client_max_body_size 30m;
      }

  Apache (VirtualHost *:443 für $DOMAIN, a2enmod proxy proxy_http headers):
      ProxyPreserveHost On
      ProxyPass / http://127.0.0.1:$APP_PORT/
      ProxyPassReverse / http://127.0.0.1:$APP_PORT/
      RequestHeader set X-Forwarded-Proto https

  Plesk: Domain anlegen → „Apache & nginx-Einstellungen“ → „Zusätzliche
  nginx-Anweisungen“: den location-Block von oben eintragen; SSL über Let's Encrypt.
────────────────────────────────────────────────────────────────────
PROXY
else
  "${COMPOSE[@]}" up -d app cron caddy
fi

if [ "$MODE" = proxy ]; then
  CHECK_URL="http://127.0.0.1:$APP_PORT/admin/login"
else
  CHECK_URL="https://$DOMAIN/admin/login"
fi
say "Warte auf $CHECK_URL …"
for _ in $(seq 1 60); do
  curl -fsS -o /dev/null "$CHECK_URL" 2>/dev/null && break
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

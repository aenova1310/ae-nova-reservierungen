# Test-Server einrichten (Hetzner Cloud)

Ergebnis: A&E NOVA Reservierungen läuft unter `https://…` mit gültigem Zertifikat, inklusive
Demo-Restaurant „Pastahaus“. Ungefährer Aufwand: 15 Minuten, Kosten ca. 4–6 € im Monat.

## 1. Server anlegen

1. Konto bei [Hetzner Cloud](https://console.hetzner.cloud) anlegen und ein Projekt erstellen.
2. **Server hinzufügen**:
   - **Standort:** Falkenstein oder Nürnberg (Deutschland)
   - **Image:** Ubuntu 24.04
   - **Typ:** CX22 (2 vCPU, 4 GB RAM) – reicht für Test und kleinen Betrieb
   - **SSH-Schlüssel:** eigenen öffentlichen Schlüssel hinterlegen (empfohlen). Ohne Schlüssel kommt
     ein root-Passwort per E-Mail.
   - Rest unverändert lassen → **Kostenpflichtig erstellen**.
3. Die angezeigte **IPv4-Adresse** notieren.

## 2. Installieren (ein Befehl)

Am eigenen Rechner im Terminal (Windows: PowerShell):

```bash
ssh root@<IPv4-Adresse>
```

Auf dem Server:

```bash
curl -fsSL https://raw.githubusercontent.com/aenova1310/ae-nova-reservierungen/main/deploy/install.sh | bash
```

Solange die Pull Requests noch nicht in `main` gemergt sind, den aktuellen Branch angeben:

```bash
curl -fsSL https://raw.githubusercontent.com/aenova1310/ae-nova-reservierungen/deploy/testserver/deploy/install.sh | BRANCH=deploy/testserver bash
```

Das Skript installiert Docker, richtet die Firewall ein (nur SSH, HTTP, HTTPS), erzeugt
zufällige Geheimnisse und Passwörter, baut die App, legt Datenbank und Demo-Daten an und startet
alles mit automatischem HTTPS. Am Ende stehen **Adresse und Demo-Zugänge** im Terminal – bitte
notieren (sie stehen auch in `/opt/ae-nova/deploy/.env`).

Ohne eigene Domain lautet die Adresse z. B. `https://203-0-113-7.sslip.io` (funktioniert sofort).

## Vorhandenen Server nutzen

Das geht, wenn es ein eigener Linux-Server mit root-Zugang ist (vServer, Root-Server, Cloud-Server –
**kein** reines Webhosting-Paket) mit **Ubuntu oder Debian** und mindestens **2 GB RAM** (besser 4 GB)
sowie ca. **10 GB freiem Speicher**.

Das Skript passt sich an:

- **Kein Webserver auf 80/443:** wie oben – die App bringt HTTPS selbst mit.
- **Es läuft schon ein Webserver** (nginx, Apache, Plesk …): daran wird nichts geändert. Die App
  lauscht nur lokal; eine (Sub-)Domain ist dann Pflicht, und am Ende zeigt das Skript die
  Weiterleitung, die im vorhandenen Webserver einzutragen ist (für nginx, Apache und Plesk):

  ```bash
  curl -fsSL https://raw.githubusercontent.com/aenova1310/ae-nova-reservierungen/deploy/testserver/deploy/install.sh | DOMAIN=reservierung.ihre-domain.de BRANCH=deploy/testserver bash
  ```

- **Firewall:** wird nur auf einem frischen Server eingeschaltet. Laufen schon andere Dienste,
  bleibt sie unverändert (ist ufw aktiv, werden höchstens 80/443 freigegeben).
- Installiert wird ausschließlich nach `/opt/ae-nova` und in Docker-Container mit eigenem Netz
  und eigener Datenbank – bestehende Datenbanken und Websites werden nicht angefasst.

## 3. Eigene Domain (optional)

1. Beim Domain-Anbieter einen **A-Eintrag** anlegen, z. B. `reservierung.ae-nova.de` → IPv4 des Servers.
2. Auf dem Server in `/opt/ae-nova/deploy/.env` die Zeile `DOMAIN=…` anpassen.
3. `/opt/ae-nova/deploy/update.sh` ausführen. Das Zertifikat wird automatisch geholt.

Hinweis: Links in bereits verschickten Mails zeigen weiter auf die alte Adresse.

## 4. E-Mails

Ohne Mail-Dienst werden **keine Mails verschickt**, sondern auf dem Server abgelegt. Ansehen
(z. B. für „Passwort vergessen“ oder Einladungen):

```bash
/opt/ae-nova/deploy/mails.sh      # letzte 3 Mails, mit Links
```

Für echten Versand: Konto bei [Resend](https://resend.com) anlegen, Absender-Domain in der Region
**eu-west-1** verifizieren, dann in `deploy/.env` `RESEND_API_KEY=…` und
`EMAIL_FROM="A&E NOVA Reservierungen <reservierung@ihre-domain.de>"` setzen und `update.sh` ausführen.

## 5. Betrieb

| Aufgabe | Befehl (auf dem Server) |
|---|---|
| Neuesten Stand einspielen | `/opt/ae-nova/deploy/update.sh` |
| Logs ansehen | `cd /opt/ae-nova && docker compose -f deploy/docker-compose.yml logs -f app` |
| Status | `cd /opt/ae-nova && docker compose -f deploy/docker-compose.yml ps` |
| Datenbank-Sicherung | `cd /opt/ae-nova && docker compose -f deploy/docker-compose.yml exec -T db pg_dump -U nova nova > backup.sql` |

Hintergrundjobs (Erinnerungen, Nachversand, Anonymisierung) laufen automatisch im Dienst `cron`.

## Vor echtem Betrieb mit Gästedaten

Der Test-Server ist bewusst einfach gehalten. Vor dem Einsatz mit echten Restaurants:

- Demo-Daten nicht anlegen (`DEMO=0`) bzw. Demo-Zugänge löschen, Super-Admin-Passwort ändern.
- Automatische Backups (Hetzner-Backups für den Server aktivieren und/oder tägliches `pg_dump`
  auf einen Speicher außerhalb des Servers).
- Auftragsverarbeitungsvertrag (AVV) mit Hetzner und Resend abschließen (beide bieten ihn online an).
- Medien optional auf Hetzner Object Storage umstellen (`MEDIA_DRIVER=s3`, siehe `.env.example`).
- Impressum und Datenschutzerklärung der Plattform ergänzen.

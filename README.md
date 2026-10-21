# A&E NOVA Reservierungen

Tischreservierungen als SaaS für inhabergeführte Restaurants: Gäste-Widget zum Einbetten,
Admin-Bereich für das Team, strikt getrennte Mandanten, Hosting in der EU, ohne Tracking.

Architektur, Datenmodell und Entscheidungen: [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md).

## Stand: Phase 1 (MVP)

| Bereich | Enthalten |
|---|---|
| Gäste-Widget | Personen → Datum → freie Uhrzeiten → Bereich/Tisch → Kontakt → Bestätigung als „Platzkarte“; Deutsch/Englisch umschaltbar; mobil zuerst; Tastatur & Screenreader (axe-geprüft) |
| Zuteilung | Pro Restaurant: **automatisch** (kleinster passender Tisch, dann Kombinationen; Gast wählt höchstens den Bereich) oder **Tischwahl durch den Gast** |
| Doppelbuchungen | Ausgeschlossen durch Advisory-Lock pro Restaurant **und** PostgreSQL-Exclusion-Constraint (getestet mit 12 parallelen Buchungen) |
| Ändern/Stornieren | Tokenbasierter Link in der E-Mail, ohne Login, bis zum Reservierungsbeginn; Tisch wird sofort frei; Mail an Gast und Restaurant |
| E-Mails | Bestätigung, Anfrage, Ablehnung, Änderung, Storno (Gast/Restaurant), Erinnerung vor dem Besuch (Vorlaufzeit einstellbar) mit `.ics` (UID/SEQUENCE/CANCEL); Outbox mit automatischem Nachversand |
| Einbindung | `<script>` (Button mit Dialog oder inline) und `<iframe>` mit automatischer Höhe; Code-Generator mit Live-Vorschau |
| Admin | Heute-Übersicht, Reservierungsliste (Filter, Suche, Status), Detail mit Verlauf, Umbuchen, Storno, Telefon-/Walk-in-Erfassung, Tagesplan pro Tisch, Tische/Bereiche/Kombinationen, Öffnungszeiten/Schichten/Ruhetage/Sonderschließungen, Verweildauer, Puffer, Slot-Raster, Online-Kontingent, Bestätigungsmodus, Branding, Datenschutztext, Team |
| Zugänge | Mitarbeiter per E-Mail einladen (Link 7 Tage gültig, Passwort legt die Person selbst fest; erneut senden/zurückziehen); „Passwort vergessen“ mit Einmal-Link (1 Stunde), danach sind alle anderen Sitzungen abgemeldet. Links sind nur als Hash gespeichert |
| Sprachen | Widget und Gäste-Mails Deutsch/Englisch; Verwaltung Deutsch/Englisch je Benutzer (Umschalter in der Seitenleiste und auf der Anmeldeseite), Konto-Mails in der Sprache des Benutzers |
| Rollen & Tarife | Inhaber/Mitarbeiter (serverseitig geprüft), Tarif-Gates im Code (`src/server/plans/features.ts`); Basic: 1 Zugang + „powered by“ |
| Super-Admin | `/superadmin`: Mandantenübersicht mit Buchungsvolumen und Monatsumsatz, Restaurant inkl. Inhaber-Zugang anlegen, sperren/freischalten, Tarif wechseln, Preise pflegen |
| Medien | Logo (alle Tarife) und Tischansicht „So sitzen Sie“ (Pro): Foto mit Vergrößern (Browser-Vollbild, auch im iframe) oder interaktives 360°-Panorama (Photo Sphere Viewer, lokal gebündelt, erst bei Bedarf geladen). Upload mit Ziehen & Ablegen; Bilder werden serverseitig gedreht, verkleinert, in WebP/PNG umgewandelt und von **allen Metadaten (GPS, Kamera)** befreit; SVG wird abgelehnt |
| Live-Tischplan | Raumplan mit dem Zustand jedes Tisches zur gewählten Uhrzeit (frei, gleich reserviert, Gast erwartet, verspätet, sitzt, Anfrage, wird eingedeckt) – mit Gastname, Personen und Zeiten direkt auf dem Tisch, Tagesleiste aller Reservierungen unter jedem Tisch, Zeitregler mit Auslastungskurve, Live-Modus (aktualisiert jede Minute), Listen „Überfällig“ und „Als Nächstes“, Schnellaktionen (eingetroffen, No-Show), kombinierte Tische verbunden. Alle Tarife; ohne Raumplan automatische Anordnung |
| Raumplan (Pro) | SVG-Editor: Bereiche anlegen, verschieben und in der Größe ändern (Tische wandern mit); Tische ziehen, drehen, Größe und Form (rechteckig/quadratisch/rund) ändern; Raster, Zoom, Rückgängig/Wiederholen, Warnung bei ungespeicherten Änderungen. Ein Tisch, der in einen anderen Bereich gezogen wird, wechselt den Bereich. Vollständig per Tastatur bedienbar und alle Werte auch als Zahlen einstellbar; Speichern in einer Transaktion mit Konfliktprüfung |
| Statistik (Pro) | Reservierungen, Gäste, No-Show-Quote, Online-Anteil, Stornierungen pro Woche/Monat mit Vergleich zum Vorzeitraum; Auslastungs-Heatmap Wochentag × Uhrzeit; Tabellenansicht; im Basic-Tarif serverseitig gesperrt |
| DSGVO | Keine Cookies/kein localStorage im Widget, Schriften selbst gehostet, Anonymisierung nach ≤ 180 Tagen, Datenauskunft (JSON) und Löschung auf Anfrage mit Protokoll |

**Noch nicht enthalten (geplant):** Phase 2 – Anzahlung mit Stripe Connect (Datenmodell und Status
`PENDING_PAYMENT` sind vorbereitet, Zahlungsfluss fehlt).

## Ausprobieren ohne Programmierkenntnisse

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) installieren und starten.
2. Dieses Projekt als ZIP herunterladen (GitHub → „Code“ → „Download ZIP“) und entpacken.
3. **Windows:** `Lokal-starten.bat` doppelklicken. **Mac:** Terminal öffnen, in den Ordner wechseln,
   `sh lokal-starten.sh` eingeben.
4. Nach dem ersten Bauen (5–10 Minuten) öffnen sich Gäste-Buchung und Verwaltung im Browser
   (`http://localhost:3000`). Zugänge stehen im Fenster. Beenden mit `Lokal-stoppen`.

## Schnellstart (lokal)

Voraussetzungen: Node.js 22, PostgreSQL 16 (lokal oder per `docker compose up -d db`).

```bash
cp .env.example .env            # Werte anpassen (APP_SECRET, CRON_SECRET)
npm install                     # erzeugt auch den Prisma-Client
npm run db:migrate              # Schema + Exclusion-Constraint anlegen
npm run db:seed                 # Demo-Restaurant „Pastahaus“
npm run dev                     # http://localhost:3000
```

| Was | Wo | Zugang |
|---|---|---|
| Gäste-Widget | http://localhost:3000/r/pastahaus | – |
| Admin (Inhaberin) | http://localhost:3000/admin/login | `inhaber@pastahaus.de` / `pastahaus-demo` |
| Admin (Mitarbeiter) | dito | `service@pastahaus.de` / `pastahaus-demo` |
| Super-Admin | dito → `/superadmin` | `admin@ae-nova.de` / `nova-superadmin` (Mandanten anlegen, sperren, Tarife) |
| Zweites Restaurant (Basic) | http://localhost:3000/r/bistro-lumen | – |

Ohne `RESEND_API_KEY` werden E-Mails nicht verschickt, sondern als HTML (plus `.ics`) unter
`.mail-outbox/` abgelegt – inklusive funktionierendem Storno-Link.

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` / `build` / `start` | Entwicklung, Produktions-Build (inkl. `embed.js`), Start |
| `npm test` | Unit-Tests (Verfügbarkeit, Zuteilung, Kontingent, Zeitumstellung, ICS) |
| `npm run test:integration` | Tests gegen echtes PostgreSQL (`TEST_DATABASE_URL`, eigene leere DB!) |
| `npm run typecheck` / `lint` | TypeScript (strict) und ESLint inkl. Schichtenregeln |
| `npm run db:migrate` / `db:deploy` / `db:seed` | Migrationen (Entwicklung/Produktion), Seed |
| `npm run build:embed` | Nur `public/embed.js` neu bauen |

Testdatenbank anlegen: `createdb nova_test && DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`.

## Projektstruktur (Kurzfassung)

```
prisma/            schema.prisma, migrations/ (inkl. Exclusion-Constraint), seed.ts
embed/embed.ts     Einbettungs-Skript → public/embed.js
src/app/           Routen: /r/[slug] (Widget), /embed/[slug] (iframe), /r/[slug]/m/[token] (Verwalten),
                   /admin/…, /api/public/…, /api/cron/[job]
src/server/        Fachlogik – einziger Ort mit DB-Zugriff
  availability/    reine Verfügbarkeits- und Zuteilungslogik (+ load.ts für DB)
  reservations/    Anlegen, Ändern, Stornieren, Status (Transaktionen + Lock)
  email/           Outbox, Templates, ICS, Provider (Resend/Datei)
  tenancy/         Tenant-Scoped Prisma Client, Zugriffsprüfung
  privacy/         Anonymisierung, Export, Löschung
src/components/    widget/, admin/, table-view/, ui/ (shadcn)
tests/             unit/, integration/
```

## Widget einbinden

Im Admin unter **Website-Einbindung** gibt es den Code mit Live-Vorschau. Kurzform:

```html
<!-- Button, öffnet das Widget in einem Dialog -->
<script src="https://app.example.de/embed.js" data-restaurant="pastahaus" async></script>

<!-- Direkt eingebettet -->
<script src="https://app.example.de/embed.js" data-restaurant="pastahaus" data-mode="inline" async></script>
```

Optionale Attribute: `data-lang="en"`, `data-label="…"`, `data-color="#6B1E2E"`, `data-target="#id"`.
Nur `/embed/*` darf von fremden Seiten eingerahmt werden (`frame-ancestors *`), alle anderen Routen
senden `frame-ancestors 'none'` und `X-Frame-Options: DENY`.

## Medien-Speicher

Logos und Tischbilder werden **immer über die eigene Domain** ausgeliefert (`/media/<schlüssel>`):
Der Bucket bleibt privat, das Widget lädt nichts von Drittanbietern, und Schlüssel enthalten einen
Inhalts-Hash (unbegrenzt cachebar). Uploads laufen über den Server (`/api/admin/media`), damit jedes
Bild geprüft und bereinigt wird – geschützt durch Session, Origin-Prüfung (CSRF), Rollen,
Tarif-Gate und Rate-Limit.

| Variable | Entwicklung | Produktion (Hetzner Object Storage) |
|---|---|---|
| `MEDIA_DRIVER` | `local` | `s3` |
| `MEDIA_LOCAL_DIR` | `.media` | – |
| `S3_ENDPOINT` | – | `https://fsn1.your-objectstorage.com` |
| `S3_REGION` | – | `fsn1` |
| `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | – | Bucket **privat** anlegen, Zugangsschlüssel in der Hetzner Console |

S3-Treiber gegen einen lokalen S3-kompatiblen Server testen (z. B. MinIO oder `moto_server -p 9100`):
`S3_TEST_ENDPOINT=http://localhost:9100 npm run test:integration`.

Grenzen: Logo max. 3 MB (→ max. 800 × 240 px PNG), Foto max. 15 MB (→ max. 2000 px WebP),
360°-Panorama max. 30 MB, Seitenverhältnis 2:1 (→ 4096 × 2048 WebP; mehr können viele Mobilgeräte
nicht darstellen). iPhone-HEIC bitte als JPG exportieren.

## Hintergrundjobs

Alle Jobs sind HTTP-Endpunkte, abgesichert mit `Authorization: Bearer $CRON_SECRET`:

| Job | Takt | Aufgabe |
|---|---|---|
| `POST /api/cron/expire-holds` | jede Minute | unbezahlte Holds (Anzahlung, Phase 2) verfallen lassen |
| `POST /api/cron/send-emails` | alle 5 Minuten | wartende/fehlgeschlagene Mails nachsenden |
| `POST /api/cron/send-reminders` | alle 15 Minuten | Erinnerungs-Mails vor dem Besuch (Vorlaufzeit je Restaurant einstellbar) |
| `POST /api/cron/anonymize` | täglich | Gastdaten nach Ablauf der Frist anonymisieren |
| `POST /api/cron/cleanup` | täglich | abgelaufene Sessions löschen |

Im Docker-Compose-Setup übernimmt der Dienst `cron` (`docker/cron.sh`) die Aufrufe.

## Deployment (EU)

**Schnellster Weg – Test-Server mit einem Befehl:** siehe [`deploy/README.md`](deploy/README.md)
(Hetzner Cloud, Docker Compose, automatisches HTTPS mit Caddy, Demo-Daten, Update-Skript).

Die App ist als Next.js-`standalone`-Build portabel. Empfohlen (siehe Architektur 3.13):

### Option A – Hetzner Cloud + Coolify (rein europäisch)

1. Server in Falkenstein/Nürnberg anlegen (z. B. CX22), Coolify installieren.
2. PostgreSQL 16 als Coolify-Ressource anlegen; tägliches Backup in Hetzner Object Storage aktivieren.
3. Neue Anwendung aus dem Git-Repository, Build-Pack **Dockerfile** (Target `runner`), Port 3000.
4. Umgebungsvariablen aus `.env.example` setzen (`APP_URL` = öffentliche Domain, starke Secrets).
5. Migrationen bei jedem Deploy: Pre-Deploy-Kommando `npx prisma migrate deploy` (Image-Target
   `migrate`) oder einmalig `docker compose run --rm migrate`.
6. Scheduled Tasks in Coolify für die fünf Cron-Endpunkte anlegen (oder den `cron`-Dienst nutzen).
7. Resend: Absenderdomain mit **Region eu-west-1** anlegen, SPF/DKIM setzen, `RESEND_API_KEY` eintragen.

Mit Docker Compose auf einem eigenen Server:

```bash
cp .env.example .env   # Werte setzen, POSTGRES_PASSWORD exportieren
docker compose up -d db
docker compose run --rm migrate
docker compose up -d app cron
```

Davor einen Reverse-Proxy mit TLS (Caddy/Traefik) setzen.

### Option B – Vercel (Region `fra1`) + Neon (Frankfurt)

Repository importieren, Region `fra1`, `DATABASE_URL` von Neon (eu-central-1), Build-Befehl
`npx prisma migrate deploy && npm run build`. Cron-Endpunkte über Vercel Cron (GET wird unterstützt)
mit `CRON_SECRET` aufrufen. Hinweis: US-Anbieter mit EU-Region – im AVV als Unterauftragsverarbeiter
mit DPF/SCC aufführen.

### Vor dem Livegang

- [ ] `APP_SECRET`, `CRON_SECRET`, DB-Passwort stark und geheim; Seed-Passwörter ändern oder Seed nicht ausführen
- [ ] `APP_URL` auf HTTPS-Domain, Resend-Domain verifiziert
- [ ] Backups der Datenbank getestet (Wiederherstellung!)
- [ ] Cron-Jobs laufen (Antworten prüfen)
- [ ] AVV, TOMs, Unterauftragsverarbeiter-Liste, Impressum/AGB bereit (siehe Architektur, Abschnitt 6)
- [ ] Rate-Limit ist In-Memory → bei mehreren App-Instanzen auf DB/Redis umstellen

## Sicherheit in Kürze

- Mandantentrennung über `tenantDb(restaurantId)` (Prisma-Extension erzwingt `restaurantId`) plus
  Zugriffsprüfung `requireRestaurantAccess` in jeder Admin-Seite/-Action; Integrationstest vorhanden.
- Passwörter mit argon2id, Sessions serverseitig (nur Token-Hash in der DB), Login-Rate-Limit,
  konstante Laufzeit bei unbekannten E-Mails.
- Verwaltungslinks: HMAC-Token (256 Bit), in der DB nur der Hash; `APP_SECRET` rotieren macht alle Links ungültig.
- Öffentliche Buchungs-API: Zod-Validierung, Honeypot, Rate-Limit pro (gehashter) IP, keine IP-Speicherung.

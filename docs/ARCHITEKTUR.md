# A&E NOVA Reservierungen – Architektur (Entwurf zur Freigabe)

Stand: 21.10.2026 · Status: **freigegeben, Phase 1 umgesetzt** (Abweichungen siehe Abschnitt 10).

Dieses Dokument beschreibt die Architektur, die wichtigsten technischen Entscheidungen und ihre
Abwägungen, das Datenmodell (`prisma/schema.prisma`), die Ordnerstruktur, die
DSGVO-Leitplanken und das Design-System. Offene Punkte stehen am Ende. Ohne andere Rückmeldung
gilt jeweils die dort genannte Standardannahme.

---

## 1. Annahmen und nicht-funktionale Anforderungen

| Thema | Annahme |
|---|---|
| Größenordnung | Anfangs 10–300 Restaurants, je 20–150 Plätze, ca. 5–200 Reservierungen pro Tag und Restaurant. Spitzen: Freitagabend, Feiertage. |
| Last | Niedrig. Kritisch ist Korrektheit, nicht Durchsatz: Eine Doppelbuchung ist schlimmer als eine 300-ms-Antwort. |
| Verfügbarkeit | 99,5 % reichen fürs MVP. Das Widget muss auch dann sauber scheitern („Bitte rufen Sie uns an …“), wenn der Server ausfällt. |
| Team | 1–2 Entwickler → ein einziges Deployment (modularer Monolith), keine Microservices. |
| Datenschutz | Alle personenbezogenen Daten liegen in der EU. Im Widget kein Tracking und keine Cookies. |
| Zeitzone | Pro Restaurant (Standard: `Europe/Berlin`). Alle Zeitpunkte werden in UTC gespeichert. |

---

## 2. Systemüberblick

```
 Website des Restaurants                    A&E NOVA (ein Next.js-Deployment, EU)
┌──────────────────────────┐             ┌──────────────────────────────────────────────────┐
│ <script src=embed.js>    │──iframe────▶│ /embed/[slug]      Gäste-Widget (ohne Cookies)   │
│   oder <iframe …>        │◀─postMessage│ /r/[slug]          Widget als eigene Seite       │
│   (Höhe automatisch)     │   (Höhe)    │ /r/[slug]/m/[tok]  Ändern/Stornieren (Token)     │
└──────────────────────────┘             │                                                  │
                                         │ /admin/…           Restaurant-Admin (Session)    │
 Restaurant-Team ───────────────────────▶│ /superadmin/…      Anbieter-Konsole              │
                                         │                                                  │
                                         │ /api/public/…      Verfügbarkeit, Buchung        │
                                         │ /api/webhooks/stripe                             │
                                         │ /api/cron/…        Holds, Mails, Anonymisierung  │
                                         │                                                  │
                                         │ src/server/  ◀── Fachlogik (rein, testbar)       │
                                         │   availability · reservations · plans · privacy  │
                                         └───────┬──────────────┬──────────────┬────────────┘
                                                 │              │              │
                                        ┌────────▼──────┐ ┌─────▼──────┐ ┌─────▼─────────────┐
                                        │ PostgreSQL 16 │ │ S3 (EU)    │ │ Resend (EU-Region)│
                                        │ + btree_gist  │ │ Logos,     │ │ Mails + .ics      │
                                        └───────────────┘ │ Tischfotos │ └───────────────────┘
                                                          └────────────┘
                                         Stripe Connect (Direct Charges auf dem Konto des Restaurants)
                                         Externer Scheduler ruft /api/cron/* auf (jede Minute bis täglich)
```

**Ein Deployment, klare Modulgrenzen.** Die UI (App Router) ruft ausschließlich Funktionen aus
`src/server/**` auf. Dort liegt die gesamte Fachlogik, und nur dort wird auf die Datenbank
zugegriffen. Die Verfügbarkeitsberechnung ist eine reine Funktion ohne DB-Zugriff und deshalb
vollständig per Unit-Test prüfbar.

---

## 3. Kernentscheidungen

### 3.1 Mandantentrennung

- **Gemeinsame Datenbank, Spalte `restaurantId` in jeder Mandantentabelle.** Für die erwartete
  Größe ist das die günstigste und am leichtesten zu betreibende Variante.
- Durchgesetzt in der Anwendung über einen **Tenant-Scoped Prisma Client** (Client-Extension in
  `src/server/tenancy/tenant-db.ts`). Er setzt `restaurantId` automatisch in jedes `where`/`data`.
  Der rohe Prisma-Client darf nur in `src/server/**` importiert werden, eine ESLint-Regel
  verbietet den Import an anderer Stelle.
- Jede Admin-Anfrage löst zuerst den Mandanten auf (`requireRestaurantAccess(slug)`: Session →
  Membership → Restaurant). Erst danach entsteht der Scoped Client.
- Ein Integrationstest pro Repository-Funktion prüft, dass Daten von Mandant A für Mandant B
  unsichtbar sind.
- *Später möglich:* Row-Level-Security in Postgres als zweite Verteidigungslinie. Das kostet
  heute mehr Komplexität (Session-Variablen pro Transaktion), als es bei dieser Größe bringt.

**Organisation und Restaurant:** Eine *Organization* (der Betrieb, Vertragspartner) hat 1–3
*Restaurants* (Standorte), jedes mit eigenem Slug, eigenen Tischen und Einstellungen. Benutzer
hängen über *Membership* (Rolle `OWNER` oder `STAFF`) an der Organisation.

### 3.2 Verfügbarkeit und Schutz vor Doppelbuchungen

Der Schutz hat drei Stufen:

1. **Anzeige (optimistisch):** `GET /api/public/[slug]/availability?date&party` berechnet die
   freien Slots aus Schichten, Ausnahmen, Verweildauer, Puffer, Tischen, Kombinationen,
   Belegungen und Online-Kontingent.
2. **Buchung (serialisiert):** `POST /api/public/[slug]/reservations` läuft in einer Transaktion:
   - `SELECT pg_advisory_xact_lock(hashtext(restaurantId))` serialisiert Buchungen *pro
     Restaurant* (andere Restaurants blockieren sich nicht).
   - Die Verfügbarkeit wird innerhalb des Locks neu berechnet. Der Server vergibt den Tisch bzw.
     prüft den gewählten Tisch. Was der Client schickt, gilt nur als Wunsch.
   - Die Online-Kontingent-Prüfung passiert ebenfalls hier. Ein DB-Constraint kann sie nicht
     abbilden, deshalb ist der Lock nötig.
3. **Letzte Absicherung in der Datenbank:** Exclusion-Constraint auf `reservation_tables`:
   ```sql
   EXCLUDE USING gist ("tableId" WITH =, tsrange("startsAt","blockedUntil",'[)') WITH &&) WHERE (active)
   ```
   Selbst bei einem Fehler in der Anwendung kann ein Tisch nie doppelt belegt werden. Getestet
   gegen PostgreSQL 16: Überlappung → Fehler `23P01`, direkt anschließende Buchung → erlaubt,
   nach Storno (`active=false`) → sofort wieder buchbar. Die API übersetzt `23P01` in `409` mit
   dem Hinweis „Dieser Zeitpunkt wurde gerade vergeben“ und lädt die Slots neu.

`blockedUntil = endsAt + bufferMinutes`, d. h. der Puffer blockiert den Tisch, verlängert aber
nicht die Zeit, die dem Gast angezeigt wird.

**Welche Status blockieren einen Tisch?** `PENDING_PAYMENT` (bis zum Verfall), `REQUESTED`,
`CONFIRMED` und `ARRIVED`. `CANCELLED`, `EXPIRED` und `DECLINED` setzen `active=false`.
`NO_SHOW` bleibt historisch belegt. Das schadet nicht, weil der Zeitpunkt in der Vergangenheit
liegt. Wenn ein No-Show früh markiert wird, kann das Restaurant den Tisch manuell freigeben.

**Slot-Erzeugung (rein, `src/server/availability/slots.ts`):**
- Für jedes Datum gilt: `DateException` (geschlossen oder Sonderzeiten) hat Vorrang vor den
  `Shift`s des Wochentags. Ein Wochentag ohne Schicht ist Ruhetag.
- Pro Schicht werden Slots von `startTime` bis `lastSeatingTime` im Intervall erzeugt (Schicht-
  oder Restaurant-Einstellung). Ohne `lastSeatingTime` gilt `endTime − Verweildauer`.
- Gefiltert wird nach Vorlaufzeit (`minLeadTimeMinutes`), maximaler Vorausbuchung, Gruppengröße
  und Online-Buchbarkeit von Bereich und Tisch.
- Lokale Wanduhrzeit wird über die Zeitzone in UTC umgerechnet (`@date-fns/tz`). Grenzfälle mit
  eigenen Tests: Sommerzeitumstellung (fehlende bzw. doppelte Stunde), Schichten über Mitternacht
  (`endTime < startTime`), Silvester, Slot genau auf der Vorlaufgrenze.

**Online-Kontingent:** Zu keinem Zeitpunkt darf die Summe der Personen aus *Online*-Buchungen,
die sich mit dem Slot überschneiden, `onlineQuotaPercent % × Summe der online buchbaren Plätze`
übersteigen. Telefon-Reservierungen und Walk-ins zählen nicht dagegen. Sie verbrauchen aber
natürlich Tische.

### 3.3 Tischzuteilung (`src/server/availability/assign.ts`)

Ein „Kandidat“ ist ein Einzeltisch oder eine definierte Tischkombination. Er passt, wenn
`min ≤ Personen ≤ max`, alle beteiligten Tische frei sind und der Bereich passt.

**Automatisch:**
1. Einzeltische vor Kombinationen.
2. Innerhalb der Einzeltische: kleinste `maxCapacity` zuerst, dann geringster Platzverlust
   (`max − Personen`), dann `sortOrder`.
3. Kombinationen: wenigste Tische zuerst, dann kleinste Gesamtkapazität, dann `sortOrder`.
4. Hat der Gast einen Bereich gewählt, wird nur dort gesucht.

Ein Slot wird nur angezeigt, wenn mindestens ein Kandidat frei ist. **Tischwahl durch den Gast:**
Das Widget zeigt pro Slot die freien Kandidaten (gruppiert nach Bereich, mit Tischansicht). Der
Server prüft die Wahl beim Buchen erneut.

Kombinationen werden **explizit** gepflegt (z. B. „T1 + T2, 5–8 Personen“) und nicht
automatisch aus Nachbarschaft abgeleitet. Nur das Restaurant weiß, welche Tische sich
tatsächlich zusammenschieben lassen. Der Raumplan-Editor (Phase 2) kann Kombinationen später per
Mehrfachauswahl vorschlagen.

*Bewusst nicht im MVP:* globale Optimierung über den ganzen Abend (z. B. einen 4er-Tisch für
eine spätere 4er-Gruppe freihalten). Die Greedy-Regel ist nachvollziehbar und deckt die
Anforderung ab. Eine Bewertungsfunktion kann sie später ersetzen, ohne die API zu ändern.

### 3.4 Reservierungs-Lebenszyklus

```
                    ┌────────── Anzahlung nötig ──────────┐
 Buchung ──▶ PENDING_PAYMENT ──bezahlt──▶ (wie unten)      │
                    │                                      │
                    └─15 min ohne Zahlung─▶ EXPIRED        │
 Buchung ──▶ manuelle Freigabe? ──ja──▶ REQUESTED ──▶ CONFIRMED | DECLINED
                                  └─nein─────────────▶ CONFIRMED
 CONFIRMED ──▶ ARRIVED | NO_SHOW | CANCELLED (Gast über Link bis Beginn, oder Restaurant)
```

- **Verwaltungslink:** Pro Reservierung werden 32 zufällige Bytes als Token erzeugt (base64url).
  In der DB liegt nur der SHA-256-Hash. Link: `/r/[slug]/m/[token]`. Darüber geht Stornieren bis
  `startsAt` und Ändern (Datum/Uhrzeit/Personen). Eine Änderung ist ein atomarer Umbuchungsvorgang
  in *einer* Transaktion: Der neue Slot wird belegt, der alte freigegeben.
  Ist eine Anzahlung beteiligt und würde sich deren Betrag ändern, ist online nur Stornieren
  möglich; der Gast erhält dann einen Hinweis.
- **E-Mails nach dem Outbox-Prinzip:** `EmailLog` wird in derselben Transaktion als `QUEUED`
  angelegt und unmittelbar nach dem Commit versendet. Fehlgeschlagene Mails holt ein Cron-Job
  nach. So geht keine Bestätigung verloren, wenn Resend kurz nicht erreichbar ist.

### 3.5 Authentifizierung

- E-Mail und Passwort (argon2id), **eigene, schlanke Session-Implementierung** nach dem
  Lucia-Muster: zufälliges Token im `httpOnly`-, `Secure`- und `SameSite=Lax`-Cookie, in der DB
  nur der Hash, gleitende Ablaufzeit (30 Tage). Weniger Abhängigkeiten und volle Kontrolle,
  passend zur EU-Datenhaltung.
  *Alternative:* Better Auth. Es bietet mehr Komfort (2FA, Magic Links), bringt aber ein eigenes
  Tabellenschema und häufigere Breaking Changes mit.
- Rollen: `OWNER` (alles inklusive Tarif, Stripe, Mitarbeiter) und `STAFF` (Reservierungen,
  Tische und Öffnungszeiten lesen und bearbeiten; keine Abrechnung, kein Stripe, keine
  Benutzerverwaltung). `SUPER_ADMIN` ist eine Plattformrolle am `User`.
- Login-Rate-Limit, Passwort-Reset per Mail-Token und Einladungen per Mail-Token.

### 3.6 Tarife und Feature-Gates

Preise liegen in der Tabelle `plans` und sind im Super-Admin editierbar. Welche Features ein
Tarif enthält, ist **im Code** festgelegt:

```ts
// src/server/plans/features.ts
export const PLAN_FEATURES = {
  BASIC: { floorplanEditor: false, tableView: false, deposits: false, statistics: false,
           maxMembers: 1, removePoweredBy: false },
  PRO:   { floorplanEditor: true,  tableView: true,  deposits: true,  statistics: true,
           maxMembers: Infinity, removePoweredBy: true },
} as const;
```

`requireFeature(restaurant, "deposits")` steht am Anfang **jeder** betroffenen Server Action und
Route und wirft `403 FEATURE_NOT_IN_PLAN`. Zusätzlich gibt die öffentliche Widget-API für
Basic-Restaurants keine Medien-URLs und keine Anzahlungsdaten heraus. Die Oberfläche blendet
gesperrte Funktionen nicht nur aus, sondern zeigt einen Hinweis auf den Pro-Tarif. Bei einem
Downgrade bleiben die Daten (Raumplan, Fotos) erhalten, werden aber nicht mehr ausgeliefert.

### 3.7 Einbettung (Embed)

- **iframe:** `https://app…/embed/[slug]?lang=de`. Das Widget sendet über `postMessage`
  `{ source: "ae-nova", type: "resize", height }`. Ein kleines optionales Snippet auf der
  Restaurantseite passt die Höhe an und prüft dabei `event.origin`.
- **Script (`/embed.js`, etwa 5 kB, Vanilla TS, per esbuild gebaut):**
  ```html
  <script src="https://app…/embed.js" data-restaurant="pastahaus" data-mode="button" data-lang="de" async></script>
  ```
  `data-mode="button"` rendert einen Button, der ein barrierearmes Modal öffnet (Fokusfalle,
  Esc, `aria-modal`, Fokus kehrt zurück). `inline` rendert das Widget direkt an Ort und Stelle.
  Intern ist es **immer ein iframe**: Das isoliert CSS und JS der Fremdseite und hält die
  Gastdaten im eigenen Origin. *Geplant (Phase 3):* zusätzlich eine versionierte, unveränderliche
  Datei mit `integrity="sha384-…"` (Subresource Integrity) für Webagenturen, die das verlangen.
- **Header:** Nur `/embed/*` erlaubt `frame-ancestors *`. Optional lässt sich das pro Restaurant
  auf eingetragene Domains beschränken. Alle anderen Routen senden `frame-ancestors 'none'`.
- **Zahlung im iframe:** Stripe Checkout wird **im Hauptfenster** geöffnet (`target="_top"` nach
  einem Klick des Gastes). Danach kehrt der Gast auf die Bestätigungsseite `/r/[slug]/…` zurück.
  Das ist zuverlässiger als eine Zahlungsmaske in einem fremden iframe (Apple Pay, 3-D Secure).

### 3.8 Anzahlung mit Stripe Connect (Phase 2)

Abgeleitet mit dem Stripe-Plugin (Connect-Empfehlung und Best Practices):

**Einordnung:** SaaS-Plattform. Das Restaurant ist Händler gegenüber dem Gast: sein Name steht
auf der Kartenabrechnung, und es bearbeitet Erstattungen und Rückbuchungen. A&E NOVA verdient
über das Abo, nicht an den Zahlungen.

**Empfohlene Konfiguration (Accounts v2, `/v2/core/accounts`):**

| Einstellung | Wert |
|---|---|
| Zahlungsart | **Direct Charges** auf dem Connected Account (Restaurant ist Merchant of Record) |
| Dashboard | Express, schlanke Ansicht für Restaurants (`dashboard: "express"`) |
| Gebühren | Stripe rechnet direkt mit dem Restaurant ab (`fees_collector: "stripe"`) |
| Haftung für negative Salden | Stripe (`losses_collector: "stripe"`), also Stripe Managed Risk, zusammen mit Radar for Platforms |
| Kontokonfiguration | `configuration.merchant` mit Capability `card_payments` |
| Onboarding | Eingebettete Connect-Komponenten im Admin: `account_onboarding`, `notification_banner`, `account_management`, `payments` (Erstattungen, Disputes) |
| Plattformgebühr | keine (`application_fee_amount` entfällt) |

> **Hinweis Public Preview:** Die Kombination Express-Dashboard + Stripe-Preisgestaltung +
> Stripe-Haftung für negative Salden bei Direct Charges ist bei Stripe derzeit Public Preview.
> Sie braucht die aktuelle Connect-Preview-API-Version
> ([Preview-Changelog](https://docs.stripe.com/changelog.md?preview=true)), gilt nur für neu
> angelegte Konten, und die Dashboard-Wahl ist pro Konto endgültig.
> **Stabile Alternative:** volles Stripe-Dashboard (`dashboard: "full"`) mit denselben
> Einstellungen. Das ist sinnvoll für Restaurants, die schon ein eigenes Stripe-Konto haben.

Da die Plattform keine Zahlungsgebühren trägt (Direct Charges, `fees_collector: "stripe"`),
entsteht kein Margenrisiko pro Transaktion.

**Ablauf:**
1. Die Buchung legt die Reservierung als `PENDING_PAYMENT` mit `holdExpiresAt = jetzt + 15 min`
   an. Der Tisch ist damit sofort per Constraint geblockt.
2. Eine Checkout Session wird *auf dem Connected Account* erstellt (Header `Stripe-Account`),
   ohne `payment_method_types` (dynamische Zahlarten). Asynchrone Zahlarten wie SEPA-Lastschrift
   werden über eine eigene Payment-Method-Configuration ausgeschlossen, weil sie das
   15-Minuten-Fenster nicht einhalten können.
3. Stripe verlangt für Checkout eine Mindestlaufzeit von 30 Minuten. Die 15-Minuten-Frist setzen
   wir deshalb selbst durch: Der Cron-Job `expire-holds` (jede Minute) setzt die Reservierung auf
   `EXPIRED`, gibt den Tisch frei und ruft `checkout.sessions.expire` auf.
4. Die **Bestätigung kommt nur per Webhook** (`checkout.session.completed` und
   `checkout.session.async_payment_succeeded`, jeweils mit Prüfung von `payment_status`), nie
   über die Erfolgsseite. Geht eine Zahlung nach dem Verfall ein (Wettlauf), wird die Reservierung
   reaktiviert, wenn der Tisch noch frei ist. Andernfalls wird automatisch erstattet und der Gast
   informiert.
5. **Storno:** Liegt es vor `freeCancellationUntil`, wird die Anzahlung automatisch voll
   erstattet (`refunds.create` auf dem Connected Account). Danach ist Stornieren weiter möglich,
   die Anzahlung verfällt (`FORFEITED`). Bei **No-Show** wird sie einbehalten. Das Restaurant kann
   jederzeit manuell erstatten.
6. Die Stornoregel wird **bei der Buchung als Snapshot** in `Payment` gespeichert. Sie erscheint
   vor der Zahlung im Widget und erneut in der E-Mail. Spätere Regeländerungen betreffen
   bestehende Buchungen nicht.

**Sicherheit:** Restricted API Key (`rk_…`) statt Secret Key, Prüfung der Webhook-Signatur,
Idempotenz über die Tabelle `stripe_events`, aktuelle API-Version und `StripeClient`-Instanz
statt globalem Key. Entwickelt wird in einer eigenen Stripe-Sandbox.

### 3.9 Tischansicht „So sitzen Sie“ (Phase 2, im MVP vorbereitet)

- `TableMedia.kind` ∈ `PHOTO | PANORAMA_360 | VIDEO | MODEL_3D`.
- Komponente `<TableViewPreview media={…} />` mit einer **Renderer-Registry**:
  `PHOTO → Lightbox`, `PANORAMA_360 → PanoramaViewer` (Photo Sphere Viewer, lokal gebündelt und
  per `next/dynamic` erst bei Bedarf geladen, kein CDN). Für alles andere und für Tische ohne
  Medium erscheint ein dezenter Platzhalter. Video oder 3D kommen später als neuer Eintrag in der
  Registry dazu, ohne Änderung am Widget.
- Upload über eine vorab signierte URL in einen S3-kompatiblen EU-Speicher. Die
  Nachbearbeitung mit `sharp` skaliert, erzeugt WebP/AVIF und **entfernt EXIF- und GPS-Daten**.

### 3.10 E-Mails und Kalender

- Resend mit Versand aus der **EU-Region** und eigener Absenderdomain pro Plattform (z. B.
  `reservierung@nova-mail.de`). Als `Reply-To` steht die Adresse des Restaurants.
- Templates mit React Email, zweisprachig, im Restaurant-Branding.
- `.ics` nach RFC 5545 mit `UID = reservation.id@…`. Eine Änderung erhöht `SEQUENCE`, ein Storno
  setzt `METHOD:CANCEL`, damit Kalender den Termin aktualisieren statt zu duplizieren.
- Ein `EmailProvider`-Interface kapselt den Versand. Ein Wechsel zu einem rein europäischen
  Anbieter ist damit ein Austausch an einer Stelle.

### 3.11 Hintergrundjobs

HTTP-Endpunkte unter `/api/cron/*`, geschützt per `CRON_SECRET` und von einem externen
Scheduler aufgerufen (Coolify Scheduled Tasks, systemd-Timer oder Vercel Cron):

| Job | Takt | Aufgabe |
|---|---|---|
| `expire-holds` | jede Minute | unbezahlte Holds → `EXPIRED`, Tisch frei, Checkout beenden |
| `send-emails` | alle 5 min | `QUEUED`/`FAILED` erneut versenden (mit Backoff) |
| `reminders` | alle 15 min | Erinnerung X Stunden vorher (Phase 3) |
| `anonymize` | täglich 03:00 | Gastdaten nach N Tagen auf `null`, `anonymizedAt` setzen |
| `stats` | täglich 03:30 | `stats_daily` neu berechnen (selbstheilend) |

Alle Jobs sind idempotent und laufen pro Batch in Transaktionen.

### 3.12 Mehrsprachigkeit

`next-intl`. Im Widget steht die Sprache **in der URL** (`?lang=en`), sie wird nicht in einem
Cookie gespeichert. Der Sprachumschalter ist ein Link. E-Mails gehen in der Sprache, in der
gebucht wurde (`reservation.locale`). Der Admin ist im MVP auf Deutsch, die englische Fassung
folgt in Phase 3.

### 3.13 Hosting (EU)

Das Deployment ist portabel: Next.js `output: "standalone"` im Docker-Image.

| Option | Komponenten | Bewertung |
|---|---|---|
| **A (empfohlen)** | Hetzner Cloud (DE) + Coolify, PostgreSQL 16 mit täglichem Backup in Object Storage, Hetzner Object Storage | rein europäische Anbieter, günstig (ca. 20–40 €/Monat), etwas mehr Betriebsaufwand |
| B | Vercel (Region `fra1`) + Neon (Frankfurt) + Cloudflare R2 (EU-Jurisdiktion) | sehr bequem; US-Anbieter mit EU-Region, abgesichert über DPF und SCC |

Die README beschreibt beide Varianten.

---

## 4. Datenmodell

Vollständiges Schema: [`prisma/schema.prisma`](../prisma/schema.prisma). Es ist mit Prisma 7
validiert und per `db push` gegen PostgreSQL 16 getestet.

```
Plan 1─n Restaurant n─1 Organization 1─n Membership n─1 User 1─n Session
                │
                ├─1 RestaurantSettings   (Regeln, Kontingent, Anzahlung, DSGVO-Texte)
                ├─1 Branding             (Logo, Farbe, Schrift, Hell/Dunkel)
                ├─1 StripeAccount        (acct_…, Status)
                ├─n Area 1─n Table 1─? TableMedia
                │            └─n CombinationTable n─1 TableCombination
                ├─n Shift · DateException · DurationRule
                ├─n Reservation 1─n ReservationTable n─1 Table   ← Exclusion-Constraint
                │        └─? Payment (Snapshot der Stornoregel)
                ├─n EmailLog · StatsDaily · PrivacyRequest · AuditLog
                └─  StripeEvent (global, Webhook-Idempotenz)
```

Wichtige Details:
- Uhrzeiten von Schichten werden als lokale `"HH:MM"`-Strings gespeichert, Zeitpunkte als UTC.
  Nur so bleibt „Abendschicht ab 18:00“ über die Zeitumstellung korrekt.
- Gastdaten liegen **direkt an der Reservierung** (keine globale Gästekartei). Das erleichtert
  Anonymisierung und Datenminimierung. Export und Löschung laufen über den Index
  `(restaurantId, guestEmail)`.
- `EmailLog` und `PrivacyRequest` speichern bewusst keine Klartext-Adressen. So entsteht kein
  zweiter Ort, an dem Gastdaten liegen.
- `StatsDaily` hält anonyme Tageszahlen. Die Kennzahlen bleiben nach der Anonymisierung
  erhalten.
- Tische und Kombinationen werden deaktiviert statt gelöscht, damit die Historie erhalten bleibt.

---

## 5. Ordnerstruktur

```
ae-nova-reservierungen/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/              # 0001_init enthält btree_gist und den Exclusion-Constraint
│  └─ seed.ts                  # Demo-Restaurant "Pastahaus" mit Raumplan und Beispielbuchungen
├─ prisma.config.ts
├─ embed/
│  └─ embed.ts                 # → public/embed.js (esbuild)
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/page.tsx                # schlanke Startseite / Login-Link
│  │  ├─ r/[slug]/page.tsx                   # Widget als eigene Seite
│  │  ├─ r/[slug]/m/[token]/page.tsx         # Ändern / Stornieren
│  │  ├─ r/[slug]/bestaetigung/[id]/page.tsx # Bestätigungsseite (Token-geschützt)
│  │  ├─ embed/[slug]/page.tsx               # Widget ohne Seitenrahmen für iframes
│  │  ├─ admin/
│  │  │  ├─ login/ · passwort-vergessen/ · einladung/[token]/
│  │  │  └─ [restaurant]/
│  │  │     ├─ page.tsx                      # Heute: Kennzahlen, nächste Gäste
│  │  │     ├─ reservierungen/               # Liste, Filter, Suche, Detail, manuell/Walk-in
│  │  │     ├─ timeline/                     # Tages-Timeline pro Tisch
│  │  │     ├─ tische/                       # Bereiche, Tische, Kombinationen, Medien
│  │  │     ├─ raumplan/                     # Drag-&-Drop-Editor (Pro)
│  │  │     ├─ oeffnungszeiten/              # Schichten, Ruhetage, Ausnahmen
│  │  │     ├─ einstellungen/                # Buchungsregeln, Bestätigung, Kontingent, Branding, Datenschutz
│  │  │     ├─ anzahlung/                    # Stripe Connect Onboarding, Regeln (Pro)
│  │  │     ├─ einbinden/                    # Embed-Code-Generator mit Live-Vorschau
│  │  │     ├─ statistik/                    # (Pro)
│  │  │     ├─ team/                         # Mitarbeiter (Owner)
│  │  │     └─ datenschutz/                  # Export / Löschung auf Anfrage
│  │  ├─ superadmin/                         # Mandanten, Tarife & Preise, Volumen
│  │  └─ api/
│  │     ├─ public/[slug]/availability/route.ts
│  │     ├─ public/[slug]/reservations/route.ts
│  │     ├─ public/manage/[token]/route.ts
│  │     ├─ webhooks/stripe/route.ts
│  │     └─ cron/[job]/route.ts
│  ├─ server/                  # Fachlogik; einziger Ort mit DB-Zugriff
│  │  ├─ db.ts                 # Prisma-Client (pg-Adapter)
│  │  ├─ tenancy/              # tenant-db.ts, require-access.ts
│  │  ├─ auth/                 # password.ts, session.ts, rate-limit.ts
│  │  ├─ availability/         # time.ts, slots.ts, assign.ts, quota.ts, index.ts (rein)
│  │  ├─ reservations/         # create.ts, modify.ts, cancel.ts, status.ts, tokens.ts
│  │  ├─ plans/                # features.ts, require-feature.ts
│  │  ├─ payments/             # stripe.ts, checkout.ts, refunds.ts, webhook.ts
│  │  ├─ email/                # provider.ts, resend.ts, outbox.ts, ics.ts, templates/*.tsx
│  │  ├─ media/                # storage.ts (S3), process.ts (sharp)
│  │  ├─ privacy/              # anonymize.ts, export.ts, erase.ts
│  │  ├─ stats/
│  │  └─ jobs/                 # Implementierungen der Cron-Jobs
│  ├─ components/
│  │  ├─ ui/                   # shadcn/ui (angepasst an die Design-Tokens)
│  │  ├─ widget/               # Schritte, SlotGrid, TablePicker, ContactForm, PlaceCard
│  │  ├─ table-view/           # TableViewPreview + Renderer-Registry
│  │  └─ admin/                # Shell, DataTable, Timeline, FloorplanEditor …
│  ├─ i18n/                    # de.json, en.json, request.ts
│  ├─ lib/                     # zod-Schemas, Formatierung, Utilities ohne Seiteneffekte
│  └─ styles/                  # tokens.css, Theme-Variablen
├─ tests/
│  ├─ unit/availability/*.test.ts   # Vitest
│  ├─ integration/                  # gegen echtes Postgres: Constraint, Parallelbuchungen, Mandantentrennung
│  └─ e2e/                          # Playwright: Widget-Ablauf, Storno-Link, Embed
├─ docs/ARCHITEKTUR.md
├─ docker/Dockerfile · docker-compose.yml (Postgres + Mailpit für lokal)
├─ .env.example
└─ README.md
```

---

## 6. DSGVO und Recht (mit dem Legal-Plugin geprüft)

> Das ist eine technische Compliance-Einordnung und keine Rechtsberatung. Die markierten Punkte
> sollten vor dem Verkaufsstart von einer Fachanwältin oder einem Fachanwalt für IT- und
> Datenschutzrecht geprüft werden.

**Gesamtbild:** Umsetzbar, mit Auflagen.

| Regelung | Bedeutung für uns | Umsetzung |
|---|---|---|
| Art. 28 DSGVO | Das Restaurant ist Verantwortlicher, A&E NOVA ist **Auftragsverarbeiter** | AVV-Vorlage, TOMs und Liste der Unterauftragsverarbeiter (Hosting, DB, Storage, Resend) bereitstellen; AVV beim Onboarding akzeptieren lassen |
| Art. 6 Abs. 1 lit. b | Rechtsgrundlage für Gastdaten ist die **Vertragsdurchführung**, nicht die Einwilligung | Die Checkbox ist eine **Kenntnisnahme** („Ich habe die Datenschutzhinweise gelesen“), keine „Einwilligung“. Version und Zeitpunkt werden gespeichert |
| Art. 9 DSGVO | Gäste schreiben oft **Allergien** in die Anmerkungen. Das sind Gesundheitsdaten | Hinweis am Anmerkungsfeld; Anmerkungen werden mit anonymisiert. ⚖️ Prüfen lassen: eigenes Allergie-Feld mit ausdrücklicher Einwilligung oder Verzicht |
| Art. 5 Abs. 1 lit. c/e | Datenminimierung und Speicherbegrenzung | Nur Pflichtfelder Name, E-Mail, Telefon. Anonymisierung nach 180 Tagen (pro Restaurant einstellbar, nur nach unten). Keine IP-Adressen in Logs |
| Art. 15, 17, 20 | Auskunft, Löschung, Übertragbarkeit | Admin-Funktion „Datenschutz“: Suche per E-Mail, Export (JSON/CSV), sofortige Anonymisierung, Nachweis in `privacy_requests` |
| § 25 TDDDG | Kein Zugriff auf Endgeräte ohne Einwilligung | Im Widget **keine Cookies und kein localStorage**, Sprache in der URL, Schriften selbst gehostet (`next/font`), keine Drittanbieter-Requests (Stripe erst beim Klick auf „Bezahlen“) |
| Art. 44 ff. | Drittlandtransfer | Hosting in DE/EU. Resend mit EU-Region (US-Anbieter, DPF und SCC). Stripe ist vertraglich direkt mit dem Restaurant verbunden |
| Art. 33/34 | Meldung von Datenpannen | Interner Ablauf: Erkennen → Restaurant innerhalb von 24 h informieren (Frist im AVV) |
| BFSG / EN 301 549 | Barrierefreiheit (seit 28.06.2025) | Ziel WCAG 2.1 AA für Widget **und** Admin; axe-Prüfung in den E2E-Tests |
| § 312g Abs. 2 Nr. 9 BGB | Widerrufsrecht bei terminierten Freizeitdienstleistungen ist ausgeschlossen | ⚖️ Gilt voraussichtlich für Reservierungen mit Anzahlung. Stornoregel und Einbehalt transparent vor der Zahlung zeigen und prüfen lassen |
| Embedding | Die Restaurant-Website überträgt beim Laden des iframes die IP-Adresse an uns | Textbaustein für die Datenschutzerklärung des Restaurants im Embed-Generator |

---

## 7. Design-System

**Leitidee:** Das Widget soll sich anfühlen wie ein gut gedeckter Tisch, ruhig und präzise; der
Admin wie ein Werkzeug, das eine Schicht lang nicht ermüdet.

**Farben (Plattform-Standard; die Primärfarbe kann jedes Restaurant überschreiben):**

| Token | Hex | Rolle |
|---|---|---|
| `porzellan` | `#F6F7F5` | Hintergrund, kühles Weiß (bewusst kein Creme) |
| `tinte` | `#1D2433` | Text und Hauptflächen im Admin, tiefes Tintenblau statt Schwarz |
| `schiefer` | `#5B6472` | Sekundärtext, Metadaten |
| `linie` | `#DCDFE3` | Trennlinien, Rahmen |
| `bordeaux` | `#6B1E2E` | Standard-Primärfarbe (Buttons, gewählter Slot) |
| `messing` | `#9C7A3C` | sparsamer Akzent (Markierung „Ihr Tisch“, Platzkarte). Nicht für Fließtext (Kontrast ca. 3,9 : 1) |

Status im Admin: angefragt = Messing, bestätigt = Tintenblau, eingetroffen = Salbeigrün
`#3F6B4F`, No-Show = Bordeaux, storniert = Schiefer, durchgestrichen. Jeder Status hat
zusätzlich ein Symbol, damit er nicht nur über die Farbe erkennbar ist.

**Typografie:**
- Widget-Überschriften: **Spectral** (Serife mit Buchdruck-Charakter, gut am Bildschirm lesbar).
- UI- und Fließtext in Widget und Admin: **Instrument Sans** mit Tabellenziffern
  (`font-variant-numeric: tabular-nums`) für Uhrzeiten und Listen.
- Beide Schriften selbst gehostet über `next/font` (keine Google-Requests). Für Restaurants gibt
  es eine kuratierte Auswahl von fünf Paarungen (Klassisch, Modern, Bistro, Neutral, Elegant).
- Schriftskala 1,25 (Major Third); Zeilenlänge im Widget höchstens 60 Zeichen.

**Das eine prägende Element:** Die Bestätigung erscheint als **Platzkarte**: Name des Gastes,
Datum, Uhrzeit, Tisch und Bereich, gesetzt in der Serife, mit einer feinen Messinglinie. Sie
sieht aus wie eine Tischkarte am Platz. Alles andere bleibt ruhig: keine Verläufe, keine
Kartenstapel mit Schatten, Bewegung nur als Antwort auf Aktionen (Schrittwechsel 150 ms,
`prefers-reduced-motion` wird respektiert).

**Restaurant-Theming:** CSS-Variablen (`--brand`, `--brand-contrast`, `--font-display`,
`--radius`) pro Restaurant. Die Textfarbe auf `--brand` wird automatisch gewählt. Liegt der
Kontrast unter 4,5 : 1, warnt der Admin beim Speichern und schlägt eine dunklere bzw. hellere
Variante vor. Der Dunkelmodus nutzt `#14181F` als Fläche und hellt die Primärfarbe automatisch
auf.

**Admin:** Linke Navigation, Inhalt mit klarer Tabellenhierarchie, dichte, aber luftige
Zeilenhöhe (44 px), Tastaturkürzel für die häufigsten Aktionen (`N` neue Reservierung, `/`
Suche, `T` heute).

---

## 8. Phasenplan

**Phase 1 – MVP**
1. Projektgerüst: Next.js, TypeScript (strict), Tailwind, shadcn/ui, Prisma 7, ESLint, Vitest,
   Docker Compose (Postgres + Mailpit)
2. Schema, erste Migration mit Constraint, Seed „Pastahaus“
3. Verfügbarkeitslogik (rein) und Unit-Tests: Überschneidungen, Puffer, Kombinationen,
   Kontingent, Sommerzeit, Mitternacht, Vorlauf
4. Auth (Owner/Staff), Mandanten-Auflösung, Tenant-Scoped Client
5. Admin: Öffnungszeiten, Bereiche, Tische, Kombinationen, Buchungsregeln, Reservierungsliste
   (Filter, Suche, Status), manuelle Buchung und Walk-in, Tages-Timeline
6. Widget: alle Schritte, beide Zuteilungsmodi, Bestätigungsseite (Platzkarte), barrierearm
7. E-Mails (Bestätigung, Anfrage, Storno an Gast und Restaurant) mit `.ics`, Outbox, Storno- und
   Änderungslink
8. Embed: iframe mit Auto-Höhe, `embed.js` (Button/Inline), Generator mit Live-Vorschau
9. Integrationstests: parallele Buchungen (genau eine gewinnt), Mandantentrennung
10. README, `.env.example`, Deployment-Anleitung

**Phase 2:** Raumplan-Editor (dnd-kit, SVG), Tischansicht/360°, Anzahlung über Stripe Connect,
Tarif-Gates (vollständig), Statistiken, Super-Admin.

**Phase 3:** Erinnerungs-Mails, Englisch im Admin, Feinschliff, Barrierefreiheits-Audit,
Performance.

---

## 9. Offene Fragen (Standardannahme in Klammern)

1. **Tarif pro Standort oder pro Betrieb?** (Pro Standort, also pro Restaurant/Slug, wie in der
   Anforderung. Ein Betrieb mit zwei Standorten zahlt zweimal.)
2. **Branding im Basic-Tarif:** Darf Basic Logo, Farbe, Schrift und Hell/Dunkel anpassen, und Pro
   entfernt nur den „powered by“-Hinweis? (Ja. Die Anforderung nennt Branding beim Widget
   allgemein, bei Pro aber „eigenes Branding ohne powered by“. Alternative: Basic nur Logo und
   Farbe.)
3. **„1 Admin-Zugang“ in Basic:** Genau ein Benutzer insgesamt, also nur der Owner? (Ja.)
4. **Abo-Abrechnung der Restaurants (39/79 €):** Soll das System die Abos selbst über Stripe
   Billing abrechnen, oder stellst du anfangs manuell Rechnungen und pflegst den Tarif im
   Super-Admin? (Manuell im MVP. Stripe Billing als Option in Phase 2.)
5. **Hosting:** Option A (Hetzner + Coolify) oder B (Vercel + Neon)? (A.)
6. **Stripe-Konfiguration:** Express-Dashboard (Public Preview, am wenigsten Aufwand für die
   Restaurants) oder volles Stripe-Dashboard (stabil)? (Express; volles Dashboard als Ausweichweg.)
7. **Domain** für App und Mail-Versand? (Platzhalter `app.ae-nova.de` / `mail.ae-nova.de`.)

---

## 10. Umsetzungsstand Phase 1 und Abweichungen vom Entwurf

| Thema | Entwurf | Umsetzung | Grund |
|---|---|---|---|
| Mehrsprachigkeit | `next-intl` | eigene typisierte Wörterbücher (`src/i18n/messages.ts`) | klein, funktioniert in Server- und Client-Komponenten und in E-Mails, keine Middleware/Locale-Routen nötig |
| E-Mail-Templates | React Email | eigene HTML-Templates mit Inline-Styles (`src/server/email/templates.ts`) | keine Zusatzabhängigkeit, volle Kontrolle, keine externen Ressourcen |
| Verwaltungslink-Token | zufällig, Hash gespeichert | HMAC(`APP_SECRET`, Reservierung, Version), Hash gespeichert | Token ist für Nachversand und spätere Erinnerungs-Mails neu berechenbar, ohne Klartext zu speichern |
| Sessions | gleitende Ablaufzeit | feste 30 Tage, `lastSeenAt` wird aktualisiert | Cookies lassen sich in Server Components nicht erneuern; Verlängerung bei Bedarf über die Login-Action |
| DB-Zugriff | roher Client nur in `src/server/**` | Tenant-Modelle über `tenantDb()`; einzelne Admin-Seiten lesen Nicht-Tenant-Modelle (Restaurant, Membership, Branding) direkt **nach** `requireRestaurantAccess` und immer mit `restaurantId`/`organizationId`-Filter | ESLint verbietet den generierten Prisma-Code außerhalb von `src/server/**` sowie Server-Module in Client-Komponenten |
| Lokale Mails | Mailpit | Datei-Outbox `.mail-outbox/` (HTML + .ics) | kein weiterer Dienst nötig |
| Doppelbuchungs-Constraint | generierte Spalte `during` | Ausdruck `tsrange(...)` direkt im Constraint | Prisma kennt die Spalte nicht → kein Migrations-Drift (geprüft: leere Folgemigration) |
| Medien-Upload | vorab signierte URL direkt in den Bucket | Upload über den Server (`/api/admin/media`) | jedes Bild wird vor dem Speichern geprüft, gedreht, verkleinert und von Metadaten (GPS) befreit; kein öffentlicher Bucket nötig |
| Medien-Auslieferung | (offen) | über die eigene Domain `/media/<key>` | Widget lädt nichts von Dritten (TDDDG), Bucket bleibt privat, Speicher austauschbar ohne URL-Änderung |
| Tischansicht im Widget | Lightbox (Dialog) | inline + Browser-Vollbild; 360°-Viewer erst auf Klick | ein Dialog läge im eingebetteten iframe (Auto-Höhe) außerhalb des sichtbaren Bereichs; three.js (~620 kB) nur bei Bedarf |
| Raumplan-Editor | dnd-kit | eigene Zeigerbedienung im SVG (`getScreenCTM`, Pointer Capture) | Drehen und Größenändern gedrehter Tische braucht ohnehin eigene Geometrie; keine Zusatzabhängigkeit |
| Raumplan speichern | (offen) | ganzer Plan in einer Transaktion, Version = Hash über alle angezeigten Werte | wurde zwischenzeitlich etwas geändert (auch auf „Tische & Bereiche“), wird abgelehnt statt still überschrieben |
| Formulare im Admin | `<form action>` | `onSubmit` + `startTransition` | React 19 setzt Formulare nach Form-Actions zurück – bei Validierungsfehlern gingen Eingaben verloren |

**Geprüft:** 50 Unit-Tests, 16 Integrationstests gegen PostgreSQL 16 (u. a. 12 parallele Buchungen →
genau eine erfolgreich; Mandantentrennung; Anonymisierung; Outbox-Nachversand), TypeScript strict,
ESLint, Produktions-Build, Standalone-Start, Browser-Durchlauf von Widget, Verwaltungslink, Admin und
Einbettung auf fremdem Origin, axe-Prüfung (WCAG 2.1 AA) ohne Befunde.
**Nicht geprüft:** Docker-Image-Build (in der Entwicklungsumgebung kein Docker-Daemon), Versand über
Resend (ohne API-Schlüssel nur Datei-Outbox).

**Vorbereitet, aber noch ohne Funktion** (bewusst, Phase 2/3): Renderer für Video/3D in der
`TableViewPreview`-Registry, Status `PENDING_PAYMENT`/Job `expire-holds` (ohne Stripe-Fluss),
`RESERVATION_REMINDER`/`reminderSentAt` (ohne Job), `StatsDaily` (Kennzahlen kommen in Phase 2),
`PasswordResetToken`/`Invitation` (Mitarbeiter werden im MVP mit Startpasswort angelegt).

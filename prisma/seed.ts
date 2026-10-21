/**
 * Seed: Tarife, Super-Admin und das Demo-Restaurant "Pastahaus" mit Raumplan,
 * Schichten, Tischkombinationen und Beispielbuchungen rund um heute.
 *
 * Aufruf: npm run db:seed (idempotent für Tarife/Benutzer; das Demo-Restaurant
 * wird bei jedem Lauf neu aufgebaut). Mit SEED_IF_EMPTY=1 passiert nichts, sobald
 * es schon ein Restaurant gibt (lokaler Start: eigene Änderungen bleiben erhalten).
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { createReservation } from "../src/server/reservations/create";
import { addDaysToDate, localToUtc, utcToLocalDate } from "../src/server/availability/time";

const TZ = "Europe/Berlin";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "pastahaus-demo";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "nova-superadmin";

async function upsertUser(email: string, name: string, password: string, platformRole: "USER" | "SUPER_ADMIN" = "USER") {
  return db.user.upsert({
    where: { email },
    update: { name, platformRole },
    create: { email, name, platformRole, passwordHash: await hashPassword(password), emailVerified: new Date() },
  });
}

async function main() {
  if (process.env.SEED_IF_EMPTY === "1" && (await db.restaurant.count()) > 0) {
    console.log("Demo-Daten vorhanden – übersprungen.");
    return;
  }
  await db.plan.upsert({
    where: { code: "BASIC" },
    update: {},
    create: { code: "BASIC", name: "Basic", priceMonthlyCents: 3900 },
  });
  await db.plan.upsert({
    where: { code: "PRO" },
    update: {},
    create: { code: "PRO", name: "Pro", priceMonthlyCents: 7900 },
  });

  await upsertUser("admin@ae-nova.de", "A&E NOVA Admin", ADMIN_PASSWORD, "SUPER_ADMIN");
  const owner = await upsertUser("inhaber@pastahaus.de", "Giulia Romano", DEMO_PASSWORD);
  const staff = await upsertUser("service@pastahaus.de", "Marco Service", DEMO_PASSWORD);

  // Demo-Restaurant neu aufbauen
  const existing = await db.restaurant.findUnique({ where: { slug: "pastahaus" } });
  if (existing) {
    await db.restaurant.delete({ where: { id: existing.id } });
    await db.organization.delete({ where: { id: existing.organizationId } }).catch(() => undefined);
  }

  const org = await db.organization.create({
    data: {
      name: "Pastahaus Romano GmbH",
      memberships: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: staff.id, role: "STAFF" },
        ],
      },
    },
  });

  const restaurant = await db.restaurant.create({
    data: {
      organizationId: org.id,
      slug: "pastahaus",
      name: "Pastahaus",
      planCode: "PRO",
      email: "reservierung@pastahaus.de",
      phone: "+49 30 555 01 23",
      street: "Kastanienallee 12",
      postalCode: "10435",
      city: "Berlin",
      websiteUrl: "https://pastahaus.example",
      settings: {
        create: {
          allocationMode: "GUEST_CHOOSES_TABLE",
          confirmationMode: "AUTOMATIC",
          slotIntervalMinutes: 15,
          bufferMinutes: 15,
          defaultDurationMinutes: 120,
          maxPartySizeOnline: 8,
          minLeadTimeMinutes: 60,
          maxAdvanceDays: 90,
          onlineQuotaPercent: 80,
        },
      },
      branding: { create: { primaryColor: "#6B1E2E", fontFamily: "serif-classic", themeMode: "LIGHT" } },
      durationRules: {
        create: [
          { minPartySize: 1, maxPartySize: 2, durationMinutes: 105 },
          { minPartySize: 3, maxPartySize: 4, durationMinutes: 120 },
          { minPartySize: 5, maxPartySize: 30, durationMinutes: 150 },
        ],
      },
      shifts: {
        create: [
          // Di–Sa Mittag und Abend, So durchgehend, Mo Ruhetag
          ...[2, 3, 4, 5, 6].flatMap((weekday) => [
            { name: "Mittag", weekday, startTime: "12:00", endTime: "14:30", lastSeatingTime: "13:30" },
            { name: "Abend", weekday, startTime: "17:30", endTime: "22:30", lastSeatingTime: "21:00" },
          ]),
          { name: "Sonntag", weekday: 7, startTime: "12:00", endTime: "21:00", lastSeatingTime: "19:30" },
        ],
      },
    },
  });

  const year = new Date().getFullYear();
  await db.dateException.createMany({
    data: [
      { restaurantId: restaurant.id, date: new Date(`${year}-12-24`), type: "CLOSED", reason: "Heiligabend" },
      { restaurantId: restaurant.id, date: new Date(`${year}-12-31`), type: "SPECIAL_HOURS", reason: "Silvester-Menü", startTime: "18:00", endTime: "01:00", lastSeatingTime: "20:00" },
    ],
  });

  // Bereiche mit Fläche im Raumplan (Raster-Pixel)
  const innen = await db.area.create({
    data: { restaurantId: restaurant.id, name: "Gastraum", nameEn: "Dining room", sortOrder: 0, planX: 0, planY: 0, planWidth: 720, planHeight: 420, planColor: "#EEF0EC" },
  });
  const fenster = await db.area.create({
    data: { restaurantId: restaurant.id, name: "Fensterfront", nameEn: "Window side", sortOrder: 1, planX: 0, planY: 440, planWidth: 720, planHeight: 140, planColor: "#E9EEF3" },
  });
  const terrasse = await db.area.create({
    data: { restaurantId: restaurant.id, name: "Terrasse", nameEn: "Terrace", sortOrder: 2, planX: 740, planY: 0, planWidth: 300, planHeight: 580, planColor: "#EEF2EA" },
  });

  type T = { name: string; areaId: string; min: number; max: number; x: number; y: number; w: number; h: number; shape: "RECT" | "SQUARE" | "ROUND"; rot?: number };
  const tableDefs: T[] = [
    // Gastraum: 2er-Reihe an der Wand, 4er in der Mitte, großer Tisch hinten
    { name: "1", areaId: innen.id, min: 1, max: 2, x: 40, y: 40, w: 70, h: 70, shape: "SQUARE" },
    { name: "2", areaId: innen.id, min: 1, max: 2, x: 140, y: 40, w: 70, h: 70, shape: "SQUARE" },
    { name: "3", areaId: innen.id, min: 1, max: 2, x: 240, y: 40, w: 70, h: 70, shape: "SQUARE" },
    { name: "4", areaId: innen.id, min: 2, max: 4, x: 60, y: 180, w: 110, h: 80, shape: "RECT" },
    { name: "5", areaId: innen.id, min: 2, max: 4, x: 220, y: 180, w: 110, h: 80, shape: "RECT" },
    { name: "6", areaId: innen.id, min: 2, max: 4, x: 380, y: 180, w: 90, h: 90, shape: "ROUND" },
    { name: "7", areaId: innen.id, min: 4, max: 8, x: 520, y: 140, w: 160, h: 90, shape: "RECT", rot: 90 },
    // Fensterfront
    { name: "F1", areaId: fenster.id, min: 1, max: 2, x: 40, y: 470, w: 70, h: 70, shape: "SQUARE" },
    { name: "F2", areaId: fenster.id, min: 1, max: 2, x: 160, y: 470, w: 70, h: 70, shape: "SQUARE" },
    { name: "F3", areaId: fenster.id, min: 2, max: 4, x: 290, y: 470, w: 110, h: 70, shape: "RECT" },
    // Terrasse (saisonal, aber im Demo online buchbar)
    { name: "T1", areaId: terrasse.id, min: 1, max: 2, x: 780, y: 40, w: 70, h: 70, shape: "ROUND" },
    { name: "T2", areaId: terrasse.id, min: 1, max: 2, x: 900, y: 40, w: 70, h: 70, shape: "ROUND" },
    { name: "T3", areaId: terrasse.id, min: 2, max: 4, x: 780, y: 180, w: 90, h: 90, shape: "ROUND" },
    { name: "T4", areaId: terrasse.id, min: 2, max: 6, x: 790, y: 330, w: 200, h: 80, shape: "RECT" },
  ];
  const tables: Record<string, string> = {};
  for (const [i, t] of tableDefs.entries()) {
    const created = await db.table.create({
      data: {
        restaurantId: restaurant.id,
        areaId: t.areaId,
        name: t.name,
        minCapacity: t.min,
        maxCapacity: t.max,
        sortOrder: i,
        posX: t.x,
        posY: t.y,
        width: t.w,
        height: t.h,
        shape: t.shape,
        rotation: t.rot ?? 0,
      },
    });
    tables[t.name] = created.id;
  }

  const combos: { name: string; tables: string[]; min: number; max: number }[] = [
    { name: "1 + 2", tables: ["1", "2"], min: 3, max: 4 },
    { name: "2 + 3", tables: ["2", "3"], min: 3, max: 4 },
    { name: "4 + 5", tables: ["4", "5"], min: 5, max: 8 },
    { name: "F1 + F2", tables: ["F1", "F2"], min: 3, max: 4 },
    { name: "4 + 5 + 6", tables: ["4", "5", "6"], min: 8, max: 12 },
  ];
  for (const c of combos) {
    await db.tableCombination.create({
      data: {
        restaurantId: restaurant.id,
        name: c.name,
        minCapacity: c.min,
        maxCapacity: c.max,
        tables: { create: c.tables.map((n) => ({ tableId: tables[n] })) },
      },
    });
  }

  // Beispielbuchungen: letzte 14 Tage (für Kennzahlen) und nächste 7 Tage
  const firstNames = ["Anna", "Jonas", "Leonie", "Felix", "Mara", "Paul", "Sofia", "Elias", "Clara", "Noah", "Ida", "Ben"];
  const lastNames = ["Schneider", "Weber", "Fischer", "Wagner", "Becker", "Hoffmann", "Koch", "Richter", "Klein", "Wolf"];
  const times = ["12:00", "12:30", "13:00", "18:00", "18:30", "19:00", "19:15", "19:30", "20:00", "20:30"];
  const today = utcToLocalDate(new Date(), TZ);
  let created = 0;
  let n = 0;

  for (let offset = -14; offset <= 7; offset++) {
    const date = addDaysToDate(today, offset);
    const perDay = offset < 0 ? 6 : 8;
    for (let i = 0; i < perDay; i++) {
      n++;
      const time = times[(n * 7) % times.length];
      const partySize = [2, 2, 2, 3, 4, 4, 5, 6][n % 8];
      const name = `${firstNames[n % firstNames.length]} ${lastNames[(n * 3) % lastNames.length]}`;
      const start = localToUtc(date, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), TZ);
      if (!start) continue;
      const source = n % 5 === 0 ? "PHONE" : "ONLINE";
      try {
        const r = await createReservation({
          restaurantId: restaurant.id,
          date,
          time,
          partySize,
          channel: source === "ONLINE" ? "ONLINE" : "STAFF",
          source,
          guest: {
            name,
            email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
            phone: `+49 151 ${String(1000000 + n * 7919).slice(0, 7)}`,
            notes: n % 6 === 0 ? "Geburtstag – gern ein ruhiger Platz" : null,
          },
          privacyAcknowledged: true,
          locale: n % 7 === 0 ? "en" : "de",
          createdById: source === "PHONE" ? staff.id : null,
          notifyGuest: false,
          // Vergangene Tage: so tun, als wäre am Vortag gebucht worden
          now: offset < 0 ? new Date(start.getTime() - 86_400_000) : new Date(),
        });
        created++;
        if (offset < 0) {
          const status = n % 11 === 0 ? "NO_SHOW" : n % 13 === 0 ? "CANCELLED" : "ARRIVED";
          await db.reservation.update({
            where: { id: r.id },
            data: { status, arrivedAt: status === "ARRIVED" ? start : null, cancelledAt: status === "CANCELLED" ? start : null, cancelledBy: status === "CANCELLED" ? "GUEST" : null },
          });
          if (status === "CANCELLED") await db.reservationTable.updateMany({ where: { reservationId: r.id }, data: { active: false } });
        }
      } catch {
        // Slot belegt oder Ruhetag – für Demo-Daten unerheblich
      }
    }
  }
  // Seed-Mails nicht versenden
  await db.emailLog.deleteMany({ where: { restaurantId: restaurant.id } });

  // Zweites (Basic-)Restaurant zur Demonstration der Mandantentrennung
  if (!(await db.restaurant.findUnique({ where: { slug: "bistro-lumen" } }))) {
    const org2 = await db.organization.create({ data: { name: "Bistro Lumen" } });
    const lumen = await db.restaurant.create({
      data: {
        organizationId: org2.id,
        slug: "bistro-lumen",
        name: "Bistro Lumen",
        planCode: "BASIC",
        email: "hallo@bistro-lumen.example",
        city: "Leipzig",
        settings: { create: {} },
        branding: { create: { primaryColor: "#24413A", fontFamily: "modern" } },
        shifts: { create: [3, 4, 5, 6].map((weekday) => ({ name: "Abend", weekday, startTime: "18:00", endTime: "23:00", lastSeatingTime: "21:00" })) },
        areas: { create: { name: "Bistro" } },
      },
      include: { areas: true },
    });
    await db.table.createMany({
      data: [
        { name: "B1", minCapacity: 1, maxCapacity: 2 },
        { name: "B2", minCapacity: 1, maxCapacity: 2 },
        { name: "B3", minCapacity: 2, maxCapacity: 4 },
        { name: "B4", minCapacity: 2, maxCapacity: 6 },
      ].map((t, i) => ({ ...t, restaurantId: lumen.id, areaId: lumen.areas[0].id, sortOrder: i })),
    });
  }

  console.info(`✓ Seed fertig: Pastahaus mit ${tableDefs.length} Tischen, ${combos.length} Kombinationen, ${created} Buchungen.`);
  console.info(`  Admin Pastahaus: inhaber@pastahaus.de / ${DEMO_PASSWORD}  (Mitarbeiter: service@pastahaus.de)`);
  console.info(`  Super-Admin:     admin@ae-nova.de / ${ADMIN_PASSWORD}`);
  console.info(`  Widget:          /r/pastahaus`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

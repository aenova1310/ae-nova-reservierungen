import { db } from "@/server/db";

/** Alle Tabellen leeren (Reihenfolge egal dank CASCADE). */
export async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

/**
 * Testrestaurant: täglich 11:00–23:00, letzter Einlass 21:00, 30-min-Raster,
 * 90 min Verweildauer, Tische nach Wunsch.
 */
export async function createRestaurant(
  slug: string,
  tables: { name: string; min: number; max: number }[] = [{ name: "T1", min: 1, max: 2 }],
  settings: Partial<{ confirmationMode: "AUTOMATIC" | "MANUAL"; allocationMode: "AUTOMATIC" | "GUEST_CHOOSES_TABLE" }> = {},
) {
  await db.plan.upsert({
    where: { code: "BASIC" },
    update: {},
    create: { code: "BASIC", name: "Basic", priceMonthlyCents: 3900 },
  });
  const org = await db.organization.create({ data: { name: `Org ${slug}` } });
  const restaurant = await db.restaurant.create({
    data: {
      organizationId: org.id,
      slug,
      name: `Restaurant ${slug}`,
      email: `${slug}@restaurant.test`,
      settings: {
        create: {
          slotIntervalMinutes: 30,
          defaultDurationMinutes: 90,
          minLeadTimeMinutes: 0,
          ...settings,
        },
      },
      shifts: {
        create: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          name: "Ganztags",
          weekday,
          startTime: "11:00",
          endTime: "23:00",
          lastSeatingTime: "21:00",
        })),
      },
      areas: { create: { name: "Innen" } },
    },
    include: { areas: true },
  });
  const created = [];
  for (const [i, t] of tables.entries()) {
    created.push(
      await db.table.create({
        data: {
          restaurantId: restaurant.id,
          areaId: restaurant.areas[0].id,
          name: t.name,
          minCapacity: t.min,
          maxCapacity: t.max,
          sortOrder: i,
        },
      }),
    );
  }
  return { org, restaurant, area: restaurant.areas[0], tables: created };
}

export const guest = (n = 1) => ({
  name: `Gast ${n}`,
  email: `gast${n}@example.test`,
  phone: "+49 30 1234567",
});

/** Fester "jetzt"-Zeitpunkt: So, 01.11.2026 11:00 Berlin. Buchungen am Di, 03.11. */
export const NOW = new Date("2026-11-01T10:00:00Z");
export const DATE = "2026-11-03";

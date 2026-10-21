import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { setEmailProvider } from "@/server/email/provider";
import { createReservation } from "@/server/reservations/create";
import {
  createTenant,
  isValidSlug,
  listTenants,
  platformSummary,
  setTenantPlan,
  setTenantStatus,
  slugify,
  TenantError,
} from "@/server/superadmin/tenants";
import { resetDatabase } from "../support/factory";

setEmailProvider({ send: async () => ({ id: "x" }) });

beforeEach(async () => {
  await resetDatabase();
  await db.plan.createMany({
    data: [
      { code: "BASIC", name: "Basic", priceMonthlyCents: 3900 },
      { code: "PRO", name: "Pro", priceMonthlyCents: 7900 },
    ],
  });
});
afterAll(() => db.$disconnect());

const input = (slug: string, overrides: Partial<Parameters<typeof createTenant>[0]> = {}) => ({
  organizationName: "Romano GmbH",
  restaurantName: "Trattoria Süd",
  slug,
  restaurantEmail: "Info@Trattoria.test",
  planCode: "BASIC" as const,
  ownerName: "Luca Romano",
  ownerEmail: "Luca@Trattoria.test",
  ownerPassword: "sehr-geheim-123",
  ...overrides,
});

describe("Slugs", () => {
  it("erzeugt saubere Slugs mit Umlauten", () => {
    expect(slugify("Trattoria Süd & Söhne")).toBe("trattoria-sued-soehne");
    expect(slugify("Osteria Lumière")).toBe("osteria-lumiere");
    expect(slugify("Café Señor Ñandú")).toBe("cafe-senor-nandu");
  });
  it("lehnt reservierte und ungültige Slugs ab", () => {
    expect(isValidSlug("admin")).toBe(false);
    expect(isValidSlug("embed")).toBe(false);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("-start")).toBe(false);
    expect(isValidSlug("doppel--strich")).toBe(false);
    expect(isValidSlug("trattoria-sued")).toBe(true);
  });
});

describe("Restaurant anlegen", () => {
  it("legt Betrieb, Restaurant, Inhaber und Standardwerte an", async () => {
    const { restaurant, ownerExisted } = await createTenant(input("trattoria-sued"));
    expect(ownerExisted).toBe(false);
    const full = await db.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
      include: { settings: true, branding: true, areas: true, durationRules: true, organization: { include: { memberships: { include: { user: true } } } } },
    });
    expect(full.email).toBe("info@trattoria.test");
    expect(full.settings).not.toBeNull();
    expect(full.branding).not.toBeNull();
    expect(full.areas).toHaveLength(1);
    expect(full.durationRules).toHaveLength(3);
    const owner = full.organization.memberships[0];
    expect(owner.role).toBe("OWNER");
    expect(owner.user.email).toBe("luca@trattoria.test");
    expect(await verifyPassword(owner.user.passwordHash, "sehr-geheim-123")).toBe(true);
  });

  it("verhindert doppelte Slugs und verknüpft bestehende Konten ohne Passwortänderung", async () => {
    await createTenant(input("trattoria-sued"));
    await expect(createTenant(input("trattoria-sued"))).rejects.toBeInstanceOf(TenantError);
    await expect(createTenant(input("admin"))).rejects.toBeInstanceOf(TenantError);

    const second = await createTenant(input("trattoria-nord", { ownerPassword: "anderes-passwort-1" }));
    expect(second.ownerExisted).toBe(true);
    const user = await db.user.findUniqueOrThrow({ where: { email: "luca@trattoria.test" }, include: { memberships: true } });
    expect(user.memberships).toHaveLength(2);
    expect(await verifyPassword(user.passwordHash, "sehr-geheim-123")).toBe(true);
  });
});

describe("Übersicht, Tarif und Sperre", () => {
  it("zählt Buchungsvolumen und Monatsumsatz nur für aktive Restaurants", async () => {
    const a = await createTenant(input("haus-a", { planCode: "PRO" }));
    await createTenant(input("haus-b", { ownerEmail: "b@test.de" }));
    await db.shift.create({
      data: { restaurantId: a.restaurant.id, name: "Abend", weekday: 2, startTime: "18:00", endTime: "23:00", lastSeatingTime: "21:00" },
    });
    await db.table.create({ data: { restaurantId: a.restaurant.id, areaId: (await db.area.findFirstOrThrow({ where: { restaurantId: a.restaurant.id } })).id, name: "1", maxCapacity: 4 } });
    await createReservation({
      restaurantId: a.restaurant.id,
      date: "2026-11-03",
      time: "19:00",
      partySize: 3,
      channel: "STAFF",
      source: "PHONE",
      guest: { name: "Test" },
      now: new Date("2026-11-01T10:00:00Z"),
    });

    const tenants = await listTenants(new Date("2026-11-01T12:00:00Z"));
    const rowA = tenants.find((t) => t.slug === "haus-a")!;
    expect(rowA.reservationsTotal).toBe(1);
    expect(rowA.upcoming).toBe(1);
    expect(rowA.owners[0].email).toBe("luca@trattoria.test");

    expect((await platformSummary()).mrrCents).toBe(7900 + 3900);
    const user = await db.user.findFirstOrThrow();
    await setTenantStatus(a.restaurant.id, "SUSPENDED", user.id);
    expect((await platformSummary()).mrrCents).toBe(3900);
    expect((await platformSummary()).suspended).toBe(1);

    await setTenantPlan(a.restaurant.id, "BASIC", user.id);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "plan.changed" } });
    expect(log.meta).toEqual({ from: "PRO", to: "BASIC" });
  });
});

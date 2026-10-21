import "server-only";
import { db } from "../db";
import { hashPassword } from "../auth/password";
import { isValidSlug } from "@/lib/slug";

export { isValidSlug, slugify } from "@/lib/slug";

/**
 * Mandanten-Übersicht mit Buchungsvolumen. Zählt alle angelegten Reservierungen
 * (auch anonymisierte – das Volumen bleibt so über die Löschfrist hinaus korrekt).
 */
export async function listTenants(now = new Date()) {
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const [restaurants, total, last30, upcoming] = await Promise.all([
    db.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        organization: {
          select: { name: true, memberships: { where: { role: "OWNER" }, select: { user: { select: { email: true, lastLoginAt: true } } } } },
        },
      },
    }),
    db.reservation.groupBy({ by: ["restaurantId"], _count: { _all: true } }),
    db.reservation.groupBy({ by: ["restaurantId"], where: { createdAt: { gte: since30 } }, _count: { _all: true }, _sum: { partySize: true } }),
    db.reservation.groupBy({
      by: ["restaurantId"],
      where: { startsAt: { gte: now }, status: { in: ["REQUESTED", "CONFIRMED", "PENDING_PAYMENT"] } },
      _count: { _all: true },
    }),
  ]);
  const map = <T extends { restaurantId: string }>(rows: T[]) => new Map(rows.map((r) => [r.restaurantId, r]));
  const totalBy = map(total);
  const lastBy = map(last30);
  const upcomingBy = map(upcoming);

  return restaurants.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    city: r.city,
    planCode: r.planCode,
    status: r.status,
    createdAt: r.createdAt,
    organization: r.organization.name,
    owners: r.organization.memberships.map((m) => m.user),
    reservationsTotal: totalBy.get(r.id)?._count._all ?? 0,
    reservations30d: lastBy.get(r.id)?._count._all ?? 0,
    guests30d: lastBy.get(r.id)?._sum.partySize ?? 0,
    upcoming: upcomingBy.get(r.id)?._count._all ?? 0,
  }));
}

export type TenantRow = Awaited<ReturnType<typeof listTenants>>[number];

export interface CreateTenantInput {
  organizationName: string;
  restaurantName: string;
  slug: string;
  restaurantEmail: string;
  city?: string | null;
  planCode: "BASIC" | "PRO";
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export class TenantError extends Error {}

/**
 * Neues Restaurant inkl. Betrieb, Inhaber-Zugang und sinnvollen Standardwerten
 * (Einstellungen, Branding, ein Bereich, Verweildauer) in EINER Transaktion.
 * Öffnungszeiten und Tische pflegt das Restaurant anschließend selbst.
 */
export async function createTenant(input: CreateTenantInput) {
  const slug = input.slug.toLowerCase();
  if (!isValidSlug(slug)) throw new TenantError("Ungültiger Slug (3–40 Zeichen, a–z, 0–9, Bindestrich).");
  if (await db.restaurant.findUnique({ where: { slug } })) throw new TenantError(`Der Slug „${slug}“ ist bereits vergeben.`);

  const ownerEmail = input.ownerEmail.toLowerCase();
  const existingUser = await db.user.findUnique({ where: { email: ownerEmail } });
  const passwordHash = existingUser ? null : await hashPassword(input.ownerPassword);

  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: input.organizationName } });
    const owner =
      existingUser ??
      (await tx.user.create({ data: { email: ownerEmail, name: input.ownerName, passwordHash: passwordHash! } }));
    await tx.membership.create({ data: { userId: owner.id, organizationId: org.id, role: "OWNER" } });

    const restaurant = await tx.restaurant.create({
      data: {
        organizationId: org.id,
        slug,
        name: input.restaurantName,
        email: input.restaurantEmail.toLowerCase(),
        city: input.city ?? null,
        planCode: input.planCode,
        settings: { create: {} },
        branding: { create: {} },
        areas: { create: { name: "Gastraum", nameEn: "Dining room" } },
        durationRules: {
          create: [
            { minPartySize: 1, maxPartySize: 2, durationMinutes: 105 },
            { minPartySize: 3, maxPartySize: 4, durationMinutes: 120 },
            { minPartySize: 5, maxPartySize: 30, durationMinutes: 150 },
          ],
        },
      },
    });
    await tx.auditLog.create({
      data: { restaurantId: restaurant.id, action: "tenant.created", entityId: restaurant.id, meta: { plan: input.planCode } },
    });
    return { restaurant, ownerExisted: !!existingUser };
  });
}

export async function setTenantStatus(restaurantId: string, status: "ACTIVE" | "SUSPENDED", userId: string) {
  await db.restaurant.update({ where: { id: restaurantId }, data: { status } });
  await db.auditLog.create({ data: { restaurantId, userId, action: `tenant.${status === "ACTIVE" ? "activated" : "suspended"}`, entityId: restaurantId } });
}

/**
 * Tarif wechseln. Beim Downgrade auf Basic bleiben Daten erhalten (Raumplan,
 * Medien, weitere Zugänge), werden aber durch die Feature-Gates nicht mehr
 * ausgeliefert bzw. es können keine neuen Zugänge angelegt werden.
 */
export async function setTenantPlan(restaurantId: string, planCode: "BASIC" | "PRO", userId: string) {
  const before = await db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { planCode: true } });
  await db.restaurant.update({ where: { id: restaurantId }, data: { planCode } });
  await db.auditLog.create({ data: { restaurantId, userId, action: "plan.changed", entityId: restaurantId, meta: { from: before.planCode, to: planCode } } });
}

export async function updatePlanPrice(code: "BASIC" | "PRO", priceMonthlyCents: number, name: string) {
  await db.plan.update({ where: { code }, data: { priceMonthlyCents, name } });
}

/** Kennzahlen für die Plattform-Übersicht (monatlich wiederkehrender Umsatz netto). */
export async function platformSummary() {
  const [plans, byPlan, reservations30d] = await Promise.all([
    db.plan.findMany({ orderBy: { priceMonthlyCents: "asc" } }),
    db.restaurant.groupBy({ by: ["planCode", "status"], _count: { _all: true } }),
    db.reservation.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);
  const active = (code: string) => byPlan.filter((r) => r.planCode === code && r.status === "ACTIVE").reduce((s, r) => s + r._count._all, 0);
  const suspended = byPlan.filter((r) => r.status === "SUSPENDED").reduce((s, r) => s + r._count._all, 0);
  const mrrCents = plans.reduce((s, p) => s + active(p.code) * p.priceMonthlyCents, 0);
  return {
    plans: plans.map((p) => ({ ...p, activeCount: active(p.code) })),
    suspended,
    mrrCents,
    reservations30d,
  };
}

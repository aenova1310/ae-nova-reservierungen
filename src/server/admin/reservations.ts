import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { addDaysToDate, localToUtc, type LocalDate } from "../availability/time";
import type { TenantDb } from "../tenancy/tenant-db";

export const STATUS_FILTERS = ["open", "REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW", "CANCELLED", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Beginn/Ende eines lokalen Tages als UTC-Zeitpunkte. */
export function dayBounds(date: LocalDate, timeZone: string): { from: Date; to: Date } {
  return {
    from: localToUtc(date, 0, timeZone) ?? new Date(`${date}T00:00:00Z`),
    to: localToUtc(addDaysToDate(date, 1), 0, timeZone) ?? new Date(`${date}T23:59:59Z`),
  };
}

export async function listReservations(
  tdb: TenantDb,
  opts: { from: Date; to: Date; status: StatusFilter; q?: string; source?: string },
) {
  const where: Prisma.ReservationWhereInput = { startsAt: { gte: opts.from, lt: opts.to } };
  if (opts.status === "open") where.status = { in: ["REQUESTED", "CONFIRMED", "ARRIVED", "PENDING_PAYMENT"] };
  else if (opts.status !== "all") where.status = opts.status;
  if (opts.source && ["ONLINE", "PHONE", "WALK_IN", "ADMIN"].includes(opts.source)) {
    where.source = opts.source as Prisma.ReservationWhereInput["source"];
  }
  if (opts.q) {
    const q = opts.q.trim();
    where.OR = [
      { guestName: { contains: q, mode: "insensitive" } },
      { guestEmail: { contains: q, mode: "insensitive" } },
      { guestPhone: { contains: q } },
      { code: { equals: q.toUpperCase() } },
    ];
  }
  return tdb.reservation.findMany({
    where,
    orderBy: { startsAt: "asc" },
    take: 500,
    include: { tables: { where: { active: true }, include: { table: { select: { name: true } } } } },
  });
}

export type ReservationRow = Awaited<ReturnType<typeof listReservations>>[number];

export async function dayStats(tdb: TenantDb, date: LocalDate, timeZone: string) {
  const { from, to } = dayBounds(date, timeZone);
  const rows = await tdb.reservation.groupBy({
    by: ["status"],
    where: { startsAt: { gte: from, lt: to } },
    _count: { _all: true },
    _sum: { partySize: true },
  });
  const pick = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status));
  const active = pick(["REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW", "PENDING_PAYMENT"]);
  return {
    reservations: active.reduce((s, r) => s + r._count._all, 0),
    guests: active.reduce((s, r) => s + (r._sum.partySize ?? 0), 0),
    requested: pick(["REQUESTED"]).reduce((s, r) => s + r._count._all, 0),
    arrived: pick(["ARRIVED"]).reduce((s, r) => s + r._count._all, 0),
    noShows: pick(["NO_SHOW"]).reduce((s, r) => s + r._count._all, 0),
    cancelled: pick(["CANCELLED"]).reduce((s, r) => s + r._count._all, 0),
  };
}

import "server-only";
import { db } from "../db";
import { requireFeature, type PlanCode } from "../plans/features";

export type Granularity = "week" | "month";

/** Status, die als stattgefundene bzw. geplante Reservierung zählen. */
const INACTIVE = ["CANCELLED", "EXPIRED", "DECLINED"];

export interface PeriodRow {
  /** Beginn des Zeitraums (lokales Datum, YYYY-MM-DD) */
  period: string;
  reservations: number;
  guests: number;
  noShows: number;
  /** Reservierungen mit erfasstem Ausgang (eingetroffen oder No-Show) – Basis der No-Show-Quote */
  settled: number;
  cancellations: number;
  online: number;
  walkIns: number;
}

interface RawRow {
  period: Date;
  reservations: bigint;
  guests: bigint | null;
  no_shows: bigint;
  settled: bigint;
  cancellations: bigint;
  online: bigint;
  walk_ins: bigint;
}

/**
 * Kennzahlen je Woche/Monat in der Zeitzone des Restaurants. Anonymisierte
 * Reservierungen zählen weiter mit (Personenzahl/Status bleiben erhalten).
 * Pro-Funktion: wirft FeatureNotInPlanError im Basic-Tarif.
 */
export async function statsByPeriod(
  restaurant: { id: string; timezone: string; planCode: PlanCode },
  granularity: Granularity,
  from: Date,
  to: Date,
): Promise<PeriodRow[]> {
  requireFeature(restaurant, "statistics");
  const rows = await db.$queryRaw<RawRow[]>`
    SELECT date_trunc(${granularity}::text, ("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE ${restaurant.timezone}::text) AS period,
           count(*) FILTER (WHERE status::text <> ALL(${INACTIVE})) AS reservations,
           sum("partySize") FILTER (WHERE status::text <> ALL(${INACTIVE})) AS guests,
           count(*) FILTER (WHERE status = 'NO_SHOW') AS no_shows,
           count(*) FILTER (WHERE status IN ('ARRIVED', 'NO_SHOW')) AS settled,
           count(*) FILTER (WHERE status = 'CANCELLED') AS cancellations,
           count(*) FILTER (WHERE source = 'ONLINE' AND status::text <> ALL(${INACTIVE})) AS online,
           count(*) FILTER (WHERE source = 'WALK_IN') AS walk_ins
      FROM reservations
     WHERE "restaurantId" = ${restaurant.id} AND "startsAt" >= ${from} AND "startsAt" < ${to}
     GROUP BY 1
     ORDER BY 1`;
  return rows.map((r) => ({
    period: toDateKey(r.period),
    reservations: Number(r.reservations),
    guests: Number(r.guests ?? 0),
    noShows: Number(r.no_shows),
    settled: Number(r.settled),
    cancellations: Number(r.cancellations),
    online: Number(r.online),
    walkIns: Number(r.walk_ins),
  }));
}

/** Gäste je Wochentag (1 = Mo) und Stunde – für die Auslastungs-Heatmap. */
export async function guestsByWeekdayHour(
  restaurant: { id: string; timezone: string; planCode: PlanCode },
  from: Date,
  to: Date,
): Promise<{ weekday: number; hour: number; guests: number; reservations: number }[]> {
  requireFeature(restaurant, "statistics");
  const rows = await db.$queryRaw<{ weekday: number; hour: number; guests: bigint; reservations: bigint }[]>`
    WITH local AS (
      SELECT ("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE ${restaurant.timezone}::text AS t, "partySize"
        FROM reservations
       WHERE "restaurantId" = ${restaurant.id} AND "startsAt" >= ${from} AND "startsAt" < ${to}
         AND status::text <> ALL(${INACTIVE})
    )
    SELECT extract(isodow FROM t)::int AS weekday, extract(hour FROM t)::int AS hour,
           sum("partySize") AS guests, count(*) AS reservations
      FROM local GROUP BY 1, 2`;
  return rows.map((r) => ({ weekday: r.weekday, hour: r.hour, guests: Number(r.guests), reservations: Number(r.reservations) }));
}

function toDateKey(d: Date): string {
  // date_trunc liefert einen Zeitstempel ohne Zone; Prisma liest ihn als UTC
  return d.toISOString().slice(0, 10);
}

/** Lückenlose Zeitraum-Liste (leere Wochen/Monate mit 0 auffüllen). */
export function fillPeriods(rows: PeriodRow[], granularity: Granularity, fromKey: string, toKey: string): PeriodRow[] {
  const byKey = new Map(rows.map((r) => [r.period, r]));
  const out: PeriodRow[] = [];
  const cursor = startOfPeriod(new Date(`${fromKey}T00:00:00Z`), granularity);
  const end = new Date(`${toKey}T00:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    out.push(byKey.get(key) ?? { period: key, reservations: 0, guests: 0, noShows: 0, settled: 0, cancellations: 0, online: 0, walkIns: 0 });
    if (granularity === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

export function startOfPeriod(d: Date, granularity: Granularity): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (granularity === "month") x.setUTCDate(1);
  else x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // ISO-Woche beginnt Montag
  return x;
}

export function summarize(rows: PeriodRow[]) {
  const sum = (k: keyof Omit<PeriodRow, "period">) => rows.reduce((s, r) => s + r[k], 0);
  const reservations = sum("reservations");
  const settled = sum("settled");
  return {
    reservations,
    guests: sum("guests"),
    noShows: sum("noShows"),
    noShowRate: settled > 0 ? sum("noShows") / settled : null,
    cancellations: sum("cancellations"),
    onlineShare: reservations > 0 ? sum("online") / reservations : null,
    avgPartySize: reservations > 0 ? sum("guests") / reservations : null,
    walkIns: sum("walkIns"),
  };
}

import "server-only";
import { layoutForView, type LivePlanData, type LiveReservation, type LiveStatus } from "@/lib/service-view";
import { loadRestaurantConfig } from "../availability/load";
import { openingWindowsFor } from "../availability/slots";
import { addDaysToDate, localToUtc, parseTime, utcToLocalDate, utcToLocalTime, type LocalDate } from "../availability/time";
import { db } from "../db";
import { loadFloorplan } from "../floorplan/service";
import { allowedTransitions } from "../reservations/status";
import type { TenantDb } from "../tenancy/tenant-db";

export type { LivePlanData };

const LIVE_STATUSES: LiveStatus[] = ["PENDING_PAYMENT", "REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW"];

/** Minuten eines Zeitpunkts bezogen auf Mitternacht des Tages `date` (Ortszeit; Folgetag → > 1440). */
export function minutesOn(date: LocalDate, instant: Date, timeZone: string): number {
  const local = utcToLocalDate(instant, timeZone);
  const minutes = parseTime(utcToLocalTime(instant, timeZone));
  if (local === date) return minutes;
  return local > date ? minutes + 1440 * (local === addDaysToDate(date, 1) ? 1 : 2) : minutes - 1440;
}

export async function loadLivePlan(
  tdb: TenantDb,
  restaurant: { id: string; timezone: string },
  date: LocalDate,
  now = new Date(),
): Promise<LivePlanData> {
  const tz = restaurant.timezone;
  const config = await loadRestaurantConfig(db, restaurant.id);
  const { windows, closedBy } = openingWindowsFor(date, config.shifts, config.exceptions, config.rules.slotIntervalMinutes);
  const fromMin = windows.length ? Math.floor(Math.min(...windows.map((w) => w.startMin)) / 60) * 60 : 11 * 60;
  const toMin = windows.length ? Math.ceil(Math.max(...windows.map((w) => w.endMin)) / 60) * 60 : 23 * 60;
  const windowStart = localToUtc(date, fromMin, tz) ?? new Date(`${date}T00:00:00Z`);
  const windowEnd = localToUtc(date, Math.min(toMin, 2880 - 1), tz) ?? new Date(`${date}T23:59:59Z`);

  const plan = await loadFloorplan(restaurant.id);
  const activeTables = plan.tables.filter((t) => t.active);
  const autoLayout = activeTables.every((t) => t.x === 0 && t.y === 0);
  const layout = layoutForView(plan.areas, activeTables);

  // Belegungen über die Zuordnungstabelle: enthält Puffer und gilt nur für aktive Zuweisungen
  const rows = await tdb.reservationTable.findMany({
    where: { active: true, startsAt: { lt: windowEnd }, blockedUntil: { gt: windowStart }, reservation: { status: { in: LIVE_STATUSES } } },
    include: {
      reservation: {
        select: { id: true, code: true, guestName: true, guestPhone: true, partySize: true, status: true, source: true, guestNotes: true, internalNotes: true, startsAt: true, endsAt: true },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const byReservation = new Map<string, LiveReservation>();
  for (const row of rows) {
    const r = row.reservation;
    const existing = byReservation.get(r.id);
    if (existing) {
      existing.tableIds.push(row.tableId);
      continue;
    }
    byReservation.set(r.id, {
      id: r.id,
      code: r.code,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      partySize: r.partySize,
      status: r.status as LiveStatus,
      source: r.source,
      hasNotes: Boolean(r.guestNotes || r.internalNotes),
      startMin: minutesOn(date, r.startsAt, tz),
      endMin: minutesOn(date, r.endsAt, tz),
      blockedMin: minutesOn(date, row.blockedUntil, tz),
      tableIds: [row.tableId],
      allowed: allowedTransitions(r.status),
    });
  }

  const today = utcToLocalDate(now, tz);
  return {
    date,
    isToday: date === today,
    nowMin: minutesOn(date, now, tz),
    nowEpoch: now.getTime(),
    fromMin,
    toMin,
    closed: Boolean(closedBy),
    autoLayout,
    areas: layout.areas,
    tables: layout.tables,
    reservations: [...byReservation.values()],
  };
}

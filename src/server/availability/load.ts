import "server-only";
import type { Db, Tx } from "../db";
import type { AvailabilityContext, BookingRules, CombinationDef, DateExceptionDef, ShiftDef, TableDef } from "./types";
import { addDaysToDate, localToUtc, type LocalDate } from "./time";

/** Status, deren Reservierungen Tische belegen. */
export const BLOCKING_STATUSES = ["PENDING_PAYMENT", "REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW"] as const;
/** Status, die ein Gast noch stornieren/ändern kann. */
export const OPEN_STATUSES = ["PENDING_PAYMENT", "REQUESTED", "CONFIRMED"] as const;

type Client = Db | Tx;

const toDateString = (d: Date | null): LocalDate | null => (d ? d.toISOString().slice(0, 10) : null);

export interface RestaurantConfig {
  restaurantId: string;
  rules: BookingRules;
  allocationMode: "GUEST_CHOOSES_TABLE" | "AUTOMATIC";
  confirmationMode: "AUTOMATIC" | "MANUAL";
  shifts: ShiftDef[];
  exceptions: DateExceptionDef[];
  areas: AvailabilityContext["areas"];
  tables: TableDef[];
  combinations: CombinationDef[];
}

/** Lädt alle Regeln, Schichten, Tische eines Restaurants. */
export async function loadRestaurantConfig(client: Client, restaurantId: string): Promise<RestaurantConfig> {
  const restaurant = await client.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    include: {
      settings: true,
      shifts: true,
      dateExceptions: true,
      durationRules: true,
      areas: { orderBy: { sortOrder: "asc" } },
      tables: { orderBy: { sortOrder: "asc" } },
      combinations: { include: { tables: true } },
    },
  });
  const s = restaurant.settings;
  if (!s) throw new Error(`Restaurant ${restaurantId} hat keine Einstellungen`);

  return {
    restaurantId,
    allocationMode: s.allocationMode,
    confirmationMode: s.confirmationMode,
    rules: {
      timezone: restaurant.timezone,
      slotIntervalMinutes: s.slotIntervalMinutes,
      bufferMinutes: s.bufferMinutes,
      defaultDurationMinutes: s.defaultDurationMinutes,
      durationRules: restaurant.durationRules.map((r) => ({
        minPartySize: r.minPartySize,
        maxPartySize: r.maxPartySize,
        durationMinutes: r.durationMinutes,
      })),
      minPartySize: s.minPartySize,
      maxPartySizeOnline: s.maxPartySizeOnline,
      minLeadTimeMinutes: s.minLeadTimeMinutes,
      maxAdvanceDays: s.maxAdvanceDays,
      onlineQuotaPercent: s.onlineQuotaPercent,
    },
    shifts: restaurant.shifts.map((sh) => ({
      id: sh.id,
      name: sh.name,
      weekday: sh.weekday,
      startTime: sh.startTime,
      endTime: sh.endTime,
      lastSeatingTime: sh.lastSeatingTime,
      slotIntervalMinutes: sh.slotIntervalMinutes,
      validFrom: toDateString(sh.validFrom),
      validUntil: toDateString(sh.validUntil),
    })),
    exceptions: restaurant.dateExceptions.map((e) => ({
      date: e.date.toISOString().slice(0, 10),
      type: e.type,
      startTime: e.startTime,
      endTime: e.endTime,
      lastSeatingTime: e.lastSeatingTime,
    })),
    areas: restaurant.areas.map((a) => ({
      id: a.id,
      name: a.name,
      nameEn: a.nameEn,
      onlineBookable: a.onlineBookable,
      sortOrder: a.sortOrder,
    })),
    tables: restaurant.tables.map((t) => ({
      id: t.id,
      name: t.name,
      areaId: t.areaId,
      minCapacity: t.minCapacity,
      maxCapacity: t.maxCapacity,
      onlineBookable: t.onlineBookable,
      active: t.active,
      sortOrder: t.sortOrder,
    })),
    combinations: restaurant.combinations.map((c) => ({
      id: c.id,
      name: c.name,
      tableIds: c.tables.map((ct) => ct.tableId),
      minCapacity: c.minCapacity,
      maxCapacity: c.maxCapacity,
      onlineBookable: c.onlineBookable,
      active: c.active,
    })),
  };
}

/**
 * Lädt Belegungen und Online-Last rund um ein Datum. Das Fenster reicht einen
 * Tag zurück und zwei Tage vor, damit Schichten über Mitternacht und lange
 * Verweildauern korrekt erfasst werden.
 */
export async function loadOccupancy(client: Client, config: RestaurantConfig, date: LocalDate, untilDate: LocalDate = date) {
  const tz = config.rules.timezone;
  const from = localToUtc(addDaysToDate(date, -1), 0, tz) ?? new Date(`${date}T00:00:00Z`);
  const to = localToUtc(addDaysToDate(untilDate, 2), 0, tz) ?? new Date(`${untilDate}T23:59:59Z`);

  // Nacheinander statt Promise.all: Innerhalb einer Transaktion teilen sich
  // die Abfragen eine Verbindung (parallele Queries sind dort nicht erlaubt).
  const rows = await client.reservationTable.findMany({
    where: { restaurantId: config.restaurantId, active: true, startsAt: { lt: to }, blockedUntil: { gt: from } },
    select: { tableId: true, startsAt: true, blockedUntil: true, reservationId: true },
  });
  const online = await client.reservation.findMany({
    where: {
      restaurantId: config.restaurantId,
      source: "ONLINE",
      status: { in: [...BLOCKING_STATUSES] },
      startsAt: { lt: to },
      endsAt: { gt: from },
    },
    select: { id: true, startsAt: true, endsAt: true, partySize: true },
  });

  return {
    occupancies: rows.map((r) => ({
      tableId: r.tableId,
      start: r.startsAt,
      end: r.blockedUntil,
      reservationId: r.reservationId,
    })),
    onlineLoads: online.map((r) => ({ reservationId: r.id, start: r.startsAt, end: r.endsAt, partySize: r.partySize })),
  };
}

export async function loadAvailabilityContext(
  client: Client,
  config: RestaurantConfig,
  date: LocalDate,
  now = new Date(),
  untilDate: LocalDate = date,
): Promise<AvailabilityContext> {
  const { occupancies, onlineLoads } = await loadOccupancy(client, config, date, untilDate);
  return {
    rules: config.rules,
    shifts: config.shifts,
    exceptions: config.exceptions,
    areas: config.areas,
    tables: config.tables,
    combinations: config.combinations,
    occupancies,
    onlineLoads,
    now,
  };
}

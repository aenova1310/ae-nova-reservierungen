/**
 * Eingabe- und Ausgabetypen der Verfügbarkeitslogik.
 * Bewusst unabhängig von Prisma: Die Logik bekommt einfache Objekte und kann
 * dadurch ohne Datenbank getestet werden. Das Mapping aus der DB passiert in
 * `src/server/availability/load.ts`.
 */
import type { LocalDate, LocalTime } from "./time";

export type BookingChannel = "ONLINE" | "STAFF";

export interface BookingRules {
  timezone: string;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  defaultDurationMinutes: number;
  durationRules: DurationRuleDef[];
  minPartySize: number;
  maxPartySizeOnline: number;
  minLeadTimeMinutes: number;
  maxAdvanceDays: number;
  /** 0–100: Anteil der online buchbaren Plätze, der gleichzeitig online belegt sein darf. */
  onlineQuotaPercent: number;
}

export interface DurationRuleDef {
  minPartySize: number;
  maxPartySize: number;
  durationMinutes: number;
}

export interface ShiftDef {
  id: string;
  name: string;
  weekday: number; // 1 = Montag … 7 = Sonntag
  startTime: LocalTime;
  endTime: LocalTime;
  lastSeatingTime: LocalTime | null;
  slotIntervalMinutes: number | null;
  validFrom: LocalDate | null;
  validUntil: LocalDate | null;
}

export interface DateExceptionDef {
  date: LocalDate;
  type: "CLOSED" | "SPECIAL_HOURS";
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  lastSeatingTime: LocalTime | null;
}

export interface AreaDef {
  id: string;
  name: string;
  nameEn?: string | null;
  onlineBookable: boolean;
  sortOrder: number;
}

export interface TableDef {
  id: string;
  name: string;
  areaId: string;
  minCapacity: number;
  maxCapacity: number;
  onlineBookable: boolean;
  active: boolean;
  sortOrder: number;
}

export interface CombinationDef {
  id: string;
  name: string;
  tableIds: string[];
  minCapacity: number;
  maxCapacity: number;
  onlineBookable: boolean;
  active: boolean;
}

/** Aktive Belegung eines Tisches (aus `reservation_tables`, inkl. Puffer). */
export interface TableOccupancy {
  tableId: string;
  start: Date;
  /** Ende inklusive Puffer (`blockedUntil`). */
  end: Date;
  reservationId: string;
}

/** Aktive Online-Buchung für die Kontingent-Prüfung (Ende ohne Puffer). */
export interface OnlineLoad {
  reservationId: string;
  start: Date;
  end: Date;
  partySize: number;
}

export interface AvailabilityContext {
  rules: BookingRules;
  shifts: ShiftDef[];
  exceptions: DateExceptionDef[];
  areas: AreaDef[];
  tables: TableDef[];
  combinations: CombinationDef[];
  occupancies: TableOccupancy[];
  onlineLoads: OnlineLoad[];
  /** Aktueller Zeitpunkt – injiziert, damit Tests deterministisch sind. */
  now: Date;
}

export interface AvailabilityQuery {
  date: LocalDate;
  partySize: number;
  channel: BookingChannel;
  /** Nur Kandidaten in diesem Bereich (Auto-Modus: optionaler Wunsch des Gastes). */
  areaId?: string | null;
  /** Bei Umbuchung: eigene Belegungen ignorieren. */
  ignoreReservationId?: string | null;
}

/** Ein buchbares "Etwas": Einzeltisch oder definierte Kombination. */
export interface Candidate {
  kind: "table" | "combination";
  id: string;
  name: string;
  tableIds: string[];
  /** Bereich, falls alle Tische im selben Bereich liegen, sonst null. */
  areaId: string | null;
  minCapacity: number;
  maxCapacity: number;
  sortOrder: number;
}

export type SlotUnavailableReason = "FULL" | "QUOTA";

export interface Slot {
  /** Lokale Uhrzeit für die Anzeige. */
  time: LocalTime;
  start: Date;
  /** Ende der Verweildauer (ohne Puffer). */
  end: Date;
  shiftName: string;
  available: boolean;
  reason?: SlotUnavailableReason;
  /** Freie Kandidaten, bestpassender zuerst. */
  candidates: Candidate[];
}

export type DayClosedReason = "CLOSED" | "RUHETAG" | "OUT_OF_RANGE" | "PARTY_SIZE";

export interface DayAvailability {
  date: LocalDate;
  closed: boolean;
  closedReason?: DayClosedReason;
  durationMinutes: number;
  slots: Slot[];
}

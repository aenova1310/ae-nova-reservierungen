/**
 * Erzeugung der Slot-Zeitpunkte aus Schichten und Ausnahmen (ohne Tischprüfung).
 */
import type { BookingRules, DateExceptionDef, DurationRuleDef, ShiftDef } from "./types";
import { isoWeekday, localToUtc, parseTime, type LocalDate, type LocalTime, formatMinutes } from "./time";

/** Verweildauer für eine Personenzahl (erste passende Regel, sonst Standard). */
export function durationFor(partySize: number, rules: Pick<BookingRules, "durationRules" | "defaultDurationMinutes">): number {
  const rule = [...rules.durationRules]
    .sort((a: DurationRuleDef, b: DurationRuleDef) => a.minPartySize - b.minPartySize)
    .find((r) => partySize >= r.minPartySize && partySize <= r.maxPartySize);
  return rule?.durationMinutes ?? rules.defaultDurationMinutes;
}

/** Ein Öffnungsfenster an einem lokalen Datum, in Minuten ab Mitternacht dieses Datums. */
export interface OpeningWindow {
  name: string;
  startMin: number;
  /** Kann > 1440 sein, wenn die Schicht über Mitternacht geht. */
  endMin: number;
  /** Letzter buchbarer Slot; null = endMin − Verweildauer. */
  lastSeatingMin: number | null;
  intervalMinutes: number;
}

function toWindow(
  name: string,
  startTime: LocalTime,
  endTime: LocalTime,
  lastSeatingTime: LocalTime | null,
  intervalMinutes: number,
): OpeningWindow {
  const startMin = parseTime(startTime);
  let endMin = parseTime(endTime);
  // Schicht über Mitternacht (z. B. 18:00–01:00)
  if (endMin <= startMin) endMin += 1440;
  let lastSeatingMin: number | null = null;
  if (lastSeatingTime) {
    lastSeatingMin = parseTime(lastSeatingTime);
    if (lastSeatingMin < startMin) lastSeatingMin += 1440;
  }
  return { name, startMin, endMin, lastSeatingMin, intervalMinutes };
}

function isShiftValidOn(shift: ShiftDef, date: LocalDate): boolean {
  if (shift.validFrom && date < shift.validFrom) return false;
  if (shift.validUntil && date > shift.validUntil) return false;
  return true;
}

/**
 * Öffnungsfenster für ein Datum. Ausnahmen haben Vorrang:
 * - CLOSED → geschlossen
 * - SPECIAL_HOURS → ersetzen alle regulären Schichten dieses Datums
 * - sonst Schichten des Wochentags (Wochentag ohne Schicht = Ruhetag)
 */
export function openingWindowsFor(
  date: LocalDate,
  shifts: ShiftDef[],
  exceptions: DateExceptionDef[],
  defaultInterval: number,
): { windows: OpeningWindow[]; closedBy: "CLOSED" | "RUHETAG" | null } {
  const todays = exceptions.filter((e) => e.date === date);
  if (todays.some((e) => e.type === "CLOSED")) return { windows: [], closedBy: "CLOSED" };

  const special = todays.filter((e) => e.type === "SPECIAL_HOURS" && e.startTime && e.endTime);
  if (special.length > 0) {
    return {
      windows: special.map((e) =>
        toWindow("Sonderöffnung", e.startTime!, e.endTime!, e.lastSeatingTime, defaultInterval),
      ),
      closedBy: null,
    };
  }

  const weekday = isoWeekday(date);
  const windows = shifts
    .filter((s) => s.weekday === weekday && isShiftValidOn(s, date))
    .map((s) => toWindow(s.name, s.startTime, s.endTime, s.lastSeatingTime, s.slotIntervalMinutes ?? defaultInterval));
  return { windows, closedBy: windows.length === 0 ? "RUHETAG" : null };
}

export interface SlotTime {
  time: LocalTime;
  start: Date;
  end: Date;
  shiftName: string;
}

/**
 * Alle Slot-Zeitpunkte eines Datums für eine Verweildauer.
 * Nicht existierende Uhrzeiten (Zeitumstellung) werden übersprungen,
 * doppelte Zeitpunkte aus überlappenden Schichten entfernt.
 */
export function slotTimesFor(date: LocalDate, windows: OpeningWindow[], durationMinutes: number, timeZone: string): SlotTime[] {
  const seen = new Set<number>();
  const result: SlotTime[] = [];

  for (const w of windows) {
    const interval = Math.max(5, w.intervalMinutes);
    const last = w.lastSeatingMin ?? w.endMin - durationMinutes;
    for (let t = w.startMin; t <= last; t += interval) {
      const start = localToUtc(date, t, timeZone);
      if (!start) continue;
      const key = start.getTime();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        time: formatMinutes(t),
        start,
        end: new Date(key + durationMinutes * 60_000),
        shiftName: w.name,
      });
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

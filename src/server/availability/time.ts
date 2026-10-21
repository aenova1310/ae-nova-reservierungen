/**
 * Zeit-Hilfsfunktionen für die Verfügbarkeitslogik.
 *
 * Grundregel: Öffnungszeiten sind lokale Wanduhrzeiten ("18:00") in der Zeitzone
 * des Restaurants. Reservierungen sind absolute Zeitpunkte (UTC). Die Umrechnung
 * passiert ausschließlich hier, damit Sommerzeit-Grenzfälle an einer Stelle
 * behandelt und getestet werden.
 */
import { TZDate, tz } from "@date-fns/tz";
import { format } from "date-fns";

/** Lokales Datum im Format YYYY-MM-DD. */
export type LocalDate = string;
/** Lokale Uhrzeit im Format HH:MM. */
export type LocalTime = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isLocalDate(value: string): value is LocalDate {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isLocalTime(value: string): value is LocalTime {
  return TIME_RE.test(value);
}

/** "18:30" → 1110 (Minuten seit Mitternacht). */
export function parseTime(value: LocalTime): number {
  const m = TIME_RE.exec(value);
  if (!m) throw new Error(`Ungültige Uhrzeit: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 1110 → "18:30" (Werte ≥ 1440 werden auf den Tag zurückgerechnet). */
export function formatMinutes(minutes: number): LocalTime {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function splitDate(date: LocalDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Ungültiges Datum: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Kalendertage addieren (rein kalendarisch, unabhängig von Zeitzonen). */
export function addDaysToDate(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = splitDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
export function isoWeekday(date: LocalDate): number {
  const [y, m, d] = splitDate(date);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Differenz in Kalendertagen (b − a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const [ay, am, ad] = splitDate(a);
  const [by, bm, bd] = splitDate(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Lokales Datum + Minuten seit Mitternacht → absoluter Zeitpunkt.
 * Gibt `null` zurück, wenn die Wanduhrzeit an diesem Tag nicht existiert
 * (Zeitumstellung im Frühjahr, z. B. 02:30 am letzten Sonntag im März).
 * Bei doppelt vorkommenden Zeiten (Herbst) wird die spätere genommen.
 */
export function localToUtc(date: LocalDate, minutes: number, timeZone: string): Date | null {
  const dayOffset = Math.floor(minutes / 1440);
  const minuteOfDay = minutes - dayOffset * 1440;
  const actualDate = dayOffset === 0 ? date : addDaysToDate(date, dayOffset);
  const [y, m, d] = splitDate(actualDate);
  const hh = Math.floor(minuteOfDay / 60);
  const mm = minuteOfDay % 60;
  const zoned = new TZDate(y, m - 1, d, hh, mm, timeZone);
  // Nicht existierende Uhrzeiten werden von TZDate nach vorne verschoben – erkennen und verwerfen.
  if (zoned.getHours() !== hh || zoned.getMinutes() !== mm || zoned.getDate() !== d) return null;
  return new Date(zoned.getTime());
}

/** Absoluter Zeitpunkt → lokales Datum (YYYY-MM-DD) in der Zeitzone. */
export function utcToLocalDate(instant: Date, timeZone: string): LocalDate {
  return format(instant, "yyyy-MM-dd", { in: tz(timeZone) });
}

/** Absoluter Zeitpunkt → lokale Uhrzeit (HH:MM) in der Zeitzone. */
export function utcToLocalTime(instant: Date, timeZone: string): LocalTime {
  return format(instant, "HH:mm", { in: tz(timeZone) });
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/** Halboffene Intervalle [aStart, aEnd) und [bStart, bEnd) überlappen sich. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

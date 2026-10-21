/**
 * Online-Kontingent: Zu keinem Zeitpunkt dürfen mehr Gäste aus Online-Buchungen
 * gleichzeitig im Restaurant sein als `onlineQuotaPercent` % der online
 * buchbaren Plätze. Telefon-/Walk-in-Buchungen zählen nicht dagegen.
 */
import type { AreaDef, OnlineLoad, TableDef } from "./types";

/** Summe der Plätze aller aktiven, online buchbaren Tische. */
export function onlineSeatCapacity(tables: TableDef[], areas: AreaDef[]): number {
  const bookableAreas = new Set(areas.filter((a) => a.onlineBookable).map((a) => a.id));
  return tables
    .filter((t) => t.active && t.onlineBookable && bookableAreas.has(t.areaId))
    .reduce((sum, t) => sum + t.maxCapacity, 0);
}

export function onlineQuotaLimit(capacity: number, quotaPercent: number): number {
  return Math.floor((capacity * Math.min(100, Math.max(0, quotaPercent))) / 100);
}

/**
 * Höchste gleichzeitige Gästezahl aus `loads` innerhalb von [start, end).
 * Sweep-Line über Start-/Endereignisse; Ende vor Start bei gleichem Zeitpunkt
 * (halboffene Intervalle).
 */
export function peakConcurrentGuests(loads: OnlineLoad[], start: Date, end: Date, ignoreReservationId?: string | null): number {
  const s = start.getTime();
  const e = end.getTime();
  const events: Array<[number, number]> = [];
  for (const l of loads) {
    if (l.reservationId === ignoreReservationId) continue;
    const ls = Math.max(l.start.getTime(), s);
    const le = Math.min(l.end.getTime(), e);
    if (ls >= le) continue;
    events.push([ls, l.partySize], [le, -l.partySize]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of events) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

/** Passt eine weitere Online-Buchung mit `partySize` Gästen ins Kontingent? */
export function fitsOnlineQuota(
  partySize: number,
  start: Date,
  end: Date,
  loads: OnlineLoad[],
  limit: number,
  ignoreReservationId?: string | null,
): boolean {
  return peakConcurrentGuests(loads, start, end, ignoreReservationId) + partySize <= limit;
}

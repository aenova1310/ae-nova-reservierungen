/**
 * Tischzuteilung: Kandidaten bilden, Belegung prüfen, bestpassenden wählen.
 *
 * Reihenfolge (siehe docs/ARCHITEKTUR.md 3.3):
 * 1. Einzeltische vor Kombinationen
 * 2. Einzeltische: kleinste maxCapacity, dann geringster Platzverlust, dann sortOrder
 * 3. Kombinationen: wenigste Tische, dann kleinste Gesamtkapazität, dann sortOrder
 */
import { overlaps } from "./time";
import type { AreaDef, BookingChannel, Candidate, CombinationDef, TableDef, TableOccupancy } from "./types";

/** Alle grundsätzlich passenden Kandidaten für eine Personenzahl (ohne Belegungsprüfung). */
export function buildCandidates(
  partySize: number,
  channel: BookingChannel,
  tables: TableDef[],
  combinations: CombinationDef[],
  areas: AreaDef[],
): Candidate[] {
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const tableById = new Map(tables.map((t) => [t.id, t]));

  const tableUsable = (t: TableDef | undefined): t is TableDef => {
    if (!t || !t.active) return false;
    if (channel === "ONLINE") {
      if (!t.onlineBookable) return false;
      if (areaById.get(t.areaId)?.onlineBookable === false) return false;
    }
    return true;
  };

  const result: Candidate[] = [];

  for (const t of tables) {
    if (!tableUsable(t)) continue;
    if (partySize < t.minCapacity || partySize > t.maxCapacity) continue;
    result.push({
      kind: "table",
      id: t.id,
      name: t.name,
      tableIds: [t.id],
      areaId: t.areaId,
      minCapacity: t.minCapacity,
      maxCapacity: t.maxCapacity,
      sortOrder: t.sortOrder,
    });
  }

  for (const c of combinations) {
    if (!c.active || c.tableIds.length === 0) continue;
    if (channel === "ONLINE" && !c.onlineBookable) continue;
    if (partySize < c.minCapacity || partySize > c.maxCapacity) continue;
    const members = c.tableIds.map((id) => tableById.get(id));
    if (!members.every(tableUsable)) continue;
    const areaIds = new Set((members as TableDef[]).map((m) => m.areaId));
    result.push({
      kind: "combination",
      id: c.id,
      name: c.name,
      tableIds: [...c.tableIds],
      areaId: areaIds.size === 1 ? [...areaIds][0] : null,
      minCapacity: c.minCapacity,
      maxCapacity: c.maxCapacity,
      sortOrder: Math.min(...(members as TableDef[]).map((m) => m.sortOrder)),
    });
  }

  return rankCandidates(result, partySize);
}

/** Sortiert Kandidaten nach "bestpassend zuerst". */
export function rankCandidates(candidates: Candidate[], partySize: number): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "table" ? -1 : 1;
    if (a.kind === "combination" && a.tableIds.length !== b.tableIds.length) {
      return a.tableIds.length - b.tableIds.length;
    }
    if (a.maxCapacity !== b.maxCapacity) return a.maxCapacity - b.maxCapacity;
    const wasteA = a.maxCapacity - partySize;
    const wasteB = b.maxCapacity - partySize;
    if (wasteA !== wasteB) return wasteA - wasteB;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "de", { numeric: true });
  });
}

/** Ist ein Tisch im Intervall [start, blockedUntil) frei? */
export function isTableFree(
  tableId: string,
  start: Date,
  blockedUntil: Date,
  occupancies: TableOccupancy[],
  ignoreReservationId?: string | null,
): boolean {
  return !occupancies.some(
    (o) =>
      o.tableId === tableId &&
      o.reservationId !== ignoreReservationId &&
      overlaps(start, blockedUntil, o.start, o.end),
  );
}

/** Filtert Kandidaten auf die im Intervall freien (alle beteiligten Tische frei). */
export function freeCandidates(
  candidates: Candidate[],
  start: Date,
  blockedUntil: Date,
  occupancies: TableOccupancy[],
  ignoreReservationId?: string | null,
): Candidate[] {
  return candidates.filter((c) =>
    c.tableIds.every((id) => isTableFree(id, start, blockedUntil, occupancies, ignoreReservationId)),
  );
}

/** Bestpassender freier Kandidat, optional eingeschränkt auf einen Bereich. */
export function pickBest(freeRanked: Candidate[], areaId?: string | null): Candidate | null {
  const pool = areaId ? freeRanked.filter((c) => c.areaId === areaId) : freeRanked;
  return pool[0] ?? null;
}

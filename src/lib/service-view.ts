import { findFreeSpot, isUnplaced, type PlanArea, type PlanTable } from "./floorplan";

/**
 * Live-Tischplan (Service-Ansicht): reine Logik, auf Server und Client nutzbar.
 * Zeiten sind Minuten ab Mitternacht des angezeigten Tages (Ortszeit des
 * Restaurants); Werte > 1440 bedeuten "nach Mitternacht".
 */

/** Alles, was der Live-Tischplan für einen Tag braucht (vom Server, serialisierbar). */
export interface LivePlanData {
  date: string;
  isToday: boolean;
  /** Aktuelle Uhrzeit in Minuten des angezeigten Tages und der zugehörige Zeitpunkt (ms). */
  nowMin: number;
  nowEpoch: number;
  /** Sichtbarer Zeitraum (volle Stunden um die Öffnungszeiten). */
  fromMin: number;
  toMin: number;
  closed: boolean;
  /** true, wenn kein Raumplan gepflegt ist und automatisch angeordnet wurde. */
  autoLayout: boolean;
  areas: PlanArea[];
  tables: PlanTable[];
  reservations: LiveReservation[];
}

export type LiveStatus = "PENDING_PAYMENT" | "REQUESTED" | "CONFIRMED" | "ARRIVED" | "NO_SHOW";

export interface LiveReservation {
  id: string;
  code: string;
  guestName: string | null;
  guestPhone: string | null;
  partySize: number;
  status: LiveStatus;
  source: string;
  hasNotes: boolean;
  startMin: number;
  endMin: number;
  /** Ende inkl. Puffer (Tisch abräumen/eindecken). */
  blockedMin: number;
  tableIds: string[];
  /** Erlaubte Statuswechsel (vom Server berechnet). */
  allowed: string[];
}

/**
 * Zustand eines Tisches zu einem Zeitpunkt.
 * - free: frei (auch länger)          - soon: frei, nächste Reservierung in ≤ 60 min
 * - expected: Reservierung läuft, Gast noch nicht da (bis 15 min nach Beginn)
 * - late: Gast seit > 15 min überfällig  - seated: Gast ist eingetroffen
 * - requested: unbestätigte Anfrage / Zahlung offen
 * - turnover: Reservierung vorbei, Puffer zum Eindecken läuft
 */
export type TableState = "free" | "soon" | "expected" | "late" | "seated" | "requested" | "turnover";

export const LATE_AFTER_MIN = 15;
export const SOON_WITHIN_MIN = 60;

export interface TableSnapshot {
  state: TableState;
  /** Reservierung, die den Tisch gerade belegt (bzw. deren Puffer läuft). */
  current: LiveReservation | null;
  /** Nächste Reservierung nach dem Zeitpunkt. */
  next: LiveReservation | null;
}

/** Diese Status belegen einen Tisch (No-Show gibt ihn im Service frei). */
const OCCUPYING: LiveStatus[] = ["PENDING_PAYMENT", "REQUESTED", "CONFIRMED", "ARRIVED"];

export function tableSnapshot(reservations: LiveReservation[], at: number): TableSnapshot {
  const relevant = reservations.filter((r) => OCCUPYING.includes(r.status)).sort((a, b) => a.startMin - b.startMin);
  // Eingetroffene Gäste belegen den Tisch, bis sie gehen – auch über die geplante Zeit hinaus
  const current =
    relevant.find((r) => r.startMin <= at && at < r.endMin) ??
    relevant.find((r) => r.status === "ARRIVED" && r.startMin <= at && at < r.blockedMin) ??
    null;
  const next = relevant.find((r) => r.startMin > at && r !== current) ?? null;

  if (current) {
    if (current.status === "ARRIVED") return { state: "seated", current, next };
    if (current.status === "REQUESTED" || current.status === "PENDING_PAYMENT") return { state: "requested", current, next };
    return { state: at >= current.startMin + LATE_AFTER_MIN ? "late" : "expected", current, next };
  }
  const turnover = relevant.find((r) => r.endMin <= at && at < r.blockedMin);
  if (turnover) return { state: "turnover", current: turnover, next };
  if (next && next.startMin - at <= SOON_WITHIN_MIN) return { state: "soon", current: null, next };
  return { state: "free", current: null, next };
}

/** Wie viele Tische sind je Zeitabschnitt belegt (für die Auslastungskurve über dem Zeitregler)? */
export function occupancyCurve(reservations: LiveReservation[], fromMin: number, toMin: number, step = 15): { min: number; tables: number; guests: number }[] {
  const out: { min: number; tables: number; guests: number }[] = [];
  const active = reservations.filter((r) => OCCUPYING.includes(r.status));
  for (let m = fromMin; m < toMin; m += step) {
    const running = active.filter((r) => r.startMin < m + step && r.endMin > m);
    out.push({ min: m, tables: new Set(running.flatMap((r) => r.tableIds)).size, guests: running.reduce((s, r) => s + r.partySize, 0) });
  }
  return out;
}

/** "19:30" aus Minuten (auch > 24 h, z. B. 25:15 → 01:15). */
export function formatMin(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Anordnung für die Ansicht. Tische mit Position aus dem Raumplan bleiben, wo
 * sie sind. Ohne Raumplan (z. B. Basic-Tarif) werden Bereiche untereinander
 * und ihre Tische in Reihen angeordnet – die Ansicht funktioniert also immer.
 */
export function layoutForView(areas: PlanArea[], tables: PlanTable[]): { areas: PlanArea[]; tables: PlanTable[] } {
  const anyPlaced = tables.some((t) => !isUnplaced(t));
  if (!anyPlaced) return autoLayout(areas, tables);
  const placed = tables.filter((t) => !isUnplaced(t));
  const result = [...placed];
  for (const t of tables.filter(isUnplaced)) {
    const area = areas.find((a) => a.id === t.areaId) ?? areas[0];
    if (!area) continue;
    result.push({ ...t, ...findFreeSpot(area, t, result) });
  }
  return { areas, tables: tables.map((t) => result.find((r) => r.id === t.id) ?? t) };
}

const AUTO = { width: 900, gap: 40, cell: 150, padTop: 50, padX: 30, rowH: 140 };

function autoLayout(areas: PlanArea[], tables: PlanTable[]) {
  const perRow = Math.max(1, Math.floor((AUTO.width - 2 * AUTO.padX) / AUTO.cell));
  const outAreas: PlanArea[] = [];
  const outTables: PlanTable[] = [];
  let y = 20;
  for (const area of areas) {
    const own = tables.filter((t) => t.areaId === area.id);
    const rows = Math.max(1, Math.ceil(own.length / perRow));
    const height = AUTO.padTop + rows * AUTO.rowH;
    outAreas.push({ ...area, x: 20, y, width: AUTO.width, height });
    own.forEach((t, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const cx = 20 + AUTO.padX + col * AUTO.cell + AUTO.cell / 2;
      const cy = y + AUTO.padTop + row * AUTO.rowH + AUTO.rowH / 2 - 15;
      outTables.push({ ...t, rotation: 0, x: cx - t.width / 2, y: cy - t.height / 2 });
    });
    y += height + AUTO.gap;
  }
  return { areas: outAreas, tables: outTables };
}

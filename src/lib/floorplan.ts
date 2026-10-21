/**
 * Geometrie des Raumplans (rein, ohne React/DB – auf Client und Server nutzbar).
 *
 * Koordinaten in "Planpunkten": Ursprung oben links, x nach rechts, y nach unten.
 * Tische: (x, y) = linke obere Ecke VOR der Drehung, Drehung um die Mitte.
 * Bereiche: achsenparallele Rechtecke (keine Drehung).
 */
export const GRID = 10;
export const PLAN_LIMITS = {
  minTable: 30,
  maxTable: 400,
  minArea: 80,
  maxCoord: 5000,
} as const;

export type TableShape = "RECT" | "SQUARE" | "ROUND";

export interface PlanTable {
  id: string;
  name: string;
  areaId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shape: TableShape;
  minCapacity: number;
  maxCapacity: number;
  active: boolean;
}

export interface PlanArea {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
}

export const snap = (v: number, grid = GRID) => Math.round(v / grid) * grid;
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Winkel auf 0–359° normieren (z. B. −15 → 345). */
export function normalizeRotation(deg: number): number {
  const r = Math.round(deg) % 360;
  return r < 0 ? r + 360 : r;
}

export function tableCenter(t: Pick<PlanTable, "x" | "y" | "width" | "height">) {
  return { x: t.x + t.width / 2, y: t.y + t.height / 2 };
}

/** Achsenparallele Hülle eines gedrehten Tisches (für Leinwandgröße und Auswahl). */
export function rotatedBounds(t: Pick<PlanTable, "x" | "y" | "width" | "height" | "rotation">) {
  const c = tableCenter(t);
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = t.width * cos + t.height * sin;
  const h = t.width * sin + t.height * cos;
  return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
}

export function contains(area: Pick<PlanArea, "x" | "y" | "width" | "height">, p: { x: number; y: number }) {
  return p.x >= area.x && p.x <= area.x + area.width && p.y >= area.y && p.y <= area.y + area.height;
}

/**
 * Bereich, in dem die Tischmitte liegt. Bei überlappenden Bereichen gewinnt
 * der kleinste (der "innere", z. B. eine Nische im Gastraum). null = außerhalb.
 */
export function areaAt(areas: PlanArea[], p: { x: number; y: number }): PlanArea | null {
  return (
    areas
      .filter((a) => contains(a, p))
      .sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null
  );
}

/** Ein Tisch gilt als "nicht platziert", solange er nie verschoben wurde (Ursprung). */
export function isUnplaced(t: Pick<PlanTable, "x" | "y">) {
  return t.x === 0 && t.y === 0;
}

/**
 * Freien Platz für einen neuen Tisch im Bereich suchen: Raster von links oben,
 * erster Platz ohne Überschneidung mit vorhandenen Tischen (inkl. Abstand).
 */
export function findFreeSpot(
  area: PlanArea,
  size: { width: number; height: number },
  tables: Pick<PlanTable, "x" | "y" | "width" | "height" | "rotation">[],
  gap = 20,
): { x: number; y: number } {
  const step = GRID * 2;
  for (let y = area.y + gap; y + size.height <= area.y + area.height - gap; y += step) {
    for (let x = area.x + gap; x + size.width <= area.x + area.width - gap; x += step) {
      const free = tables.every((t) => {
        const b = rotatedBounds(t);
        return x + size.width + gap <= b.x || b.x + b.width + gap <= x || y + size.height + gap <= b.y || b.y + b.height + gap <= y;
      });
      if (free) return { x: snap(x), y: snap(y) };
    }
  }
  // Kein Platz frei: in die Mitte legen (sichtbar überlappend statt unsichtbar)
  return { x: snap(area.x + area.width / 2 - size.width / 2), y: snap(area.y + area.height / 2 - size.height / 2) };
}

/** Leinwandgröße: alles sichtbar plus Rand, mindestens 1000 × 640. */
export function canvasSize(areas: PlanArea[], tables: PlanTable[], margin = 80) {
  let w = 1000;
  let h = 640;
  for (const a of areas) {
    w = Math.max(w, a.x + a.width + margin);
    h = Math.max(h, a.y + a.height + margin);
  }
  for (const t of tables) {
    if (isUnplaced(t)) continue;
    const b = rotatedBounds(t);
    w = Math.max(w, b.x + b.width + margin);
    h = Math.max(h, b.y + b.height + margin);
  }
  return { width: Math.ceil(w / GRID) * GRID, height: Math.ceil(h / GRID) * GRID };
}

/** Normiert Tischwerte auf erlaubte Grenzen (Client nach jeder Änderung, Server beim Speichern). */
export function sanitizeTable<T extends Pick<PlanTable, "x" | "y" | "width" | "height" | "rotation" | "shape">>(t: T): T {
  let width = clamp(Math.round(t.width), PLAN_LIMITS.minTable, PLAN_LIMITS.maxTable);
  let height = clamp(Math.round(t.height), PLAN_LIMITS.minTable, PLAN_LIMITS.maxTable);
  // Quadratische und runde Tische haben gleiche Seiten
  if (t.shape !== "RECT") width = height = Math.max(width, height);
  return {
    ...t,
    width,
    height,
    x: clamp(Math.round(t.x), 0, PLAN_LIMITS.maxCoord),
    y: clamp(Math.round(t.y), 0, PLAN_LIMITS.maxCoord),
    rotation: normalizeRotation(t.rotation),
  };
}

export function sanitizeArea<A extends Pick<PlanArea, "x" | "y" | "width" | "height">>(a: A): A {
  return {
    ...a,
    x: clamp(Math.round(a.x), 0, PLAN_LIMITS.maxCoord),
    y: clamp(Math.round(a.y), 0, PLAN_LIMITS.maxCoord),
    width: clamp(Math.round(a.width), PLAN_LIMITS.minArea, PLAN_LIMITS.maxCoord),
    height: clamp(Math.round(a.height), PLAN_LIMITS.minArea, PLAN_LIMITS.maxCoord),
  };
}

/** Ruhige, gut unterscheidbare Flächenfarben für Bereiche (Hintergrund, kein Bedeutungsträger). */
export const AREA_COLORS = ["#EEF0EC", "#E9EEF3", "#EEF2EA", "#F3EEE8", "#EEEAF2", "#F2F0E6"] as const;

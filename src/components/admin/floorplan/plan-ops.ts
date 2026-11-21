import { areaAt, findFreeSpot, isUnplaced, nearestFreeSpot, sanitizeArea, sanitizeTable, tableCenter, type PlanArea, type PlanTable } from "@/lib/floorplan";

/** Zustand des Editors und reine Änderungsfunktionen (gemeinsam für Zeichenfläche und Seitenleiste). */
export interface Plan {
  areas: PlanArea[];
  tables: PlanTable[];
}

export type Selection = { kind: "table" | "area"; id: string } | null;

/** Neue Bereiche tragen bis zum Speichern eine temporäre ID (Server vergibt die echte). */
export const NEW_AREA_PREFIX = "new:";

const sameValues = <T extends object>(a: T, b: T) => (Object.keys(a) as (keyof T)[]).every((k) => a[k] === b[k]);

/** (0, 0) bedeutet "nicht platziert" – ein platzierter Tisch darf nicht versehentlich dorthin rutschen. */
function placedTable(before: PlanTable, next: PlanTable): PlanTable {
  const t = sanitizeTable(next);
  const kept = isUnplaced(t) && !isUnplaced(before) ? { ...t, x: 1 } : t;
  // Unverändert → altes Objekt, damit Verlauf und "ungespeichert" nicht ohne Änderung anspringen
  return sameValues(before, kept) ? before : kept;
}

export function updateTable(p: Plan, id: string, fn: (t: PlanTable) => PlanTable): Plan {
  let changed = false;
  const tables = p.tables.map((t) => {
    if (t.id !== id) return t;
    const next = placedTable(t, fn(t));
    changed ||= next !== t;
    return next;
  });
  return changed ? { ...p, tables } : p;
}

export function updateArea(p: Plan, id: string, fn: (a: PlanArea) => PlanArea): Plan {
  let changed = false;
  const areas = p.areas.map((a) => {
    if (a.id !== id) return a;
    const next = sanitizeArea(fn(a));
    if (sameValues(a, next)) return a;
    changed = true;
    return next;
  });
  return changed ? { ...p, areas } : p;
}

/** Bereich verschieben; seine platzierten Tische wandern mit. */
export function moveArea(p: Plan, id: string, x: number, y: number): Plan {
  const start = p.areas.find((a) => a.id === id);
  if (!start) return p;
  const moved = updateArea(p, id, (a) => ({ ...a, x, y }));
  const end = moved.areas.find((a) => a.id === id)!;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return p;
  return {
    ...moved,
    tables: moved.tables.map((t) => (t.areaId === id && !isUnplaced(t) ? placedTable(t, { ...t, x: t.x + dx, y: t.y + dy }) : t)),
  };
}

/** Nach dem Verschieben: Tisch gehört zu dem Bereich, in dem seine Mitte liegt (außerhalb → bisheriger). */
export function reassignArea(p: Plan, id: string): Plan {
  const t = p.tables.find((x) => x.id === id);
  if (!t) return p;
  const area = areaAt(p.areas, tableCenter(t));
  return area && area.id !== t.areaId ? { ...p, tables: p.tables.map((x) => (x.id === id ? { ...x, areaId: area.id } : x)) } : p;
}

/** Tisch an einen freien Platz in seinem (oder dem gewählten) Bereich legen. */
export function placeTable(p: Plan, id: string, areaId?: string): Plan {
  const t = p.tables.find((x) => x.id === id);
  const area = p.areas.find((a) => a.id === (areaId ?? t?.areaId)) ?? p.areas[0];
  if (!t || !area) return p;
  const others = p.tables.filter((x) => x.id !== id && !isUnplaced(x));
  const spot = findFreeSpot(area, t, others);
  return updateTable(p, id, (x) => ({ ...x, ...spot, areaId: area.id }));
}

// ─── Tische anlegen, duplizieren, löschen ──────────────────────────────────

/** Neue Tische tragen bis zum Speichern eine temporäre ID (Server vergibt die echte). */
export const NEW_TABLE_PREFIX = "newt:";

export type PresetKey = "2round" | "2square" | "4rect" | "4round" | "6rect" | "8rect";

/** Vorlagen für die Tischleiste: Form, Größe (Planpunkte) und Plätze. */
export const TABLE_PRESETS: Record<PresetKey, { shape: PlanTable["shape"]; width: number; height: number; min: number; max: number }> = {
  "2round": { shape: "ROUND", width: 70, height: 70, min: 1, max: 2 },
  "2square": { shape: "SQUARE", width: 70, height: 70, min: 1, max: 2 },
  "4rect": { shape: "RECT", width: 110, height: 80, min: 2, max: 4 },
  "4round": { shape: "ROUND", width: 100, height: 100, min: 2, max: 4 },
  "6rect": { shape: "RECT", width: 160, height: 80, min: 4, max: 6 },
  "8rect": { shape: "RECT", width: 220, height: 90, min: 6, max: 8 },
};

/**
 * Nächster freier Tischname: Bei Zahlen-Namen ("1", "2", …) die nächste Zahl,
 * sonst "T1", "T2", … Belegte Namen (auch deaktivierter Tische) werden übersprungen.
 */
export function nextTableName(tables: Pick<PlanTable, "name">[], taken: string[] = []): string {
  const used = new Set([...tables.map((t) => t.name.toLocaleLowerCase("de")), ...taken.map((n) => n.toLocaleLowerCase("de"))]);
  const numeric = tables.map((t) => Number(t.name)).filter((n) => Number.isInteger(n) && n > 0);
  let n = numeric.length ? Math.max(...numeric) + 1 : tables.length + 1;
  const make = (k: number) => (numeric.length ? String(k) : `T${k}`);
  while (used.has(make(n).toLocaleLowerCase("de"))) n++;
  return make(n);
}

/**
 * Tisch aus Vorlage anlegen – an einem Punkt (Ablegen aus der Leiste) oder am
 * nächsten freien Platz im Bereich. Liefert den neuen Plan und die ID.
 */
export function addTable(
  p: Plan,
  preset: PresetKey,
  opts: { areaId?: string; at?: { x: number; y: number }; id?: string; taken?: string[] } = {},
): { plan: Plan; id: string } | null {
  const spec = TABLE_PRESETS[preset];
  const atArea = opts.at ? areaAt(p.areas, opts.at) : null;
  const area = atArea ?? p.areas.find((a) => a.id === opts.areaId) ?? p.areas[0];
  if (!area) return null;
  const id = opts.id ?? `${NEW_TABLE_PREFIX}${crypto.randomUUID()}`;
  const base: PlanTable = {
    id,
    name: nextTableName(p.tables, opts.taken),
    areaId: area.id,
    x: 0,
    y: 0,
    width: spec.width,
    height: spec.height,
    rotation: 0,
    shape: spec.shape,
    minCapacity: spec.min,
    maxCapacity: spec.max,
    active: true,
    onlineBookable: true,
  };
  const others = p.tables.filter((t) => !isUnplaced(t));
  // Ablegen: möglichst am Ablegepunkt, aber nicht auf einem anderen Tisch
  const spot = opts.at ? nearestFreeSpot(area, base, others, opts.at) : findFreeSpot(area, base, others);
  const table = sanitizeTable({ ...base, ...spot });
  return { plan: { ...p, tables: [...p.tables, isUnplaced(table) ? { ...table, x: 1 } : table] }, id };
}

/** Kopie neben dem Original (gleiche Form, Größe und Plätze, neuer Name). */
export function duplicateTable(p: Plan, id: string, opts: { id?: string; taken?: string[] } = {}): { plan: Plan; id: string } | null {
  const src = p.tables.find((t) => t.id === id);
  const area = src && p.areas.find((a) => a.id === src.areaId);
  if (!src || !area) return null;
  const newId = opts.id ?? `${NEW_TABLE_PREFIX}${crypto.randomUUID()}`;
  const copy: PlanTable = { ...src, id: newId, name: nextTableName(p.tables, opts.taken) };
  const spot = findFreeSpot(area, copy, p.tables.filter((t) => !isUnplaced(t)));
  return { plan: { ...p, tables: [...p.tables, sanitizeTable({ ...copy, ...spot })] }, id: newId };
}

export function deleteTable(p: Plan, id: string): Plan {
  return p.tables.some((t) => t.id === id) ? { ...p, tables: p.tables.filter((t) => t.id !== id) } : p;
}

/** Bereich entfernen – nur wenn keine Tische mehr darin stehen. */
export function deleteArea(p: Plan, id: string): Plan {
  if (p.tables.some((t) => t.areaId === id) || p.areas.length <= 1) return p;
  return { ...p, areas: p.areas.filter((a) => a.id !== id) };
}

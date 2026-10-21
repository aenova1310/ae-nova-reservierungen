import { areaAt, findFreeSpot, isUnplaced, sanitizeArea, sanitizeTable, tableCenter, type PlanArea, type PlanTable } from "@/lib/floorplan";

/** Zustand des Editors und reine Änderungsfunktionen (gemeinsam für Zeichenfläche und Seitenleiste). */
export interface Plan {
  areas: PlanArea[];
  tables: PlanTable[];
}

export type Selection = { kind: "table" | "area"; id: string } | null;

/** Neue Bereiche tragen bis zum Speichern eine temporäre ID (Server vergibt die echte). */
export const NEW_AREA_PREFIX = "new:";

export function updateTable(p: Plan, id: string, fn: (t: PlanTable) => PlanTable): Plan {
  return {
    ...p,
    tables: p.tables.map((t) => {
      if (t.id !== id) return t;
      const next = sanitizeTable(fn(t));
      // (0, 0) bedeutet "nicht platziert" – ein platzierter Tisch darf nicht versehentlich dorthin rutschen
      return isUnplaced(next) && !isUnplaced(t) ? { ...next, x: 1 } : next;
    }),
  };
}

export function updateArea(p: Plan, id: string, fn: (a: PlanArea) => PlanArea): Plan {
  return { ...p, areas: p.areas.map((a) => (a.id === id ? sanitizeArea(fn(a)) : a)) };
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
    tables: moved.tables.map((t) => (t.areaId === id && !isUnplaced(t) ? sanitizeTable({ ...t, x: t.x + dx, y: t.y + dy }) : t)),
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

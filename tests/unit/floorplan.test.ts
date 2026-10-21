import { describe, expect, it } from "vitest";
import {
  areaAt,
  canvasSize,
  findFreeSpot,
  normalizeRotation,
  rotatedBounds,
  sanitizeArea,
  sanitizeTable,
  snap,
  type PlanArea,
  type PlanTable,
} from "@/lib/floorplan";
import { HISTORY_LIMIT, historyReducer, initHistory } from "@/lib/history";

const area = (id: string, x: number, y: number, width: number, height: number): PlanArea => ({ id, name: id, x, y, width, height, color: null });
const table = (over: Partial<PlanTable> = {}): PlanTable => ({
  id: "t",
  name: "T1",
  areaId: "a",
  x: 100,
  y: 100,
  width: 80,
  height: 60,
  rotation: 0,
  shape: "RECT",
  minCapacity: 1,
  maxCapacity: 4,
  active: true,
  ...over,
});

describe("Raumplan-Geometrie", () => {
  it("rastet auf das Raster ein", () => {
    expect(snap(14)).toBe(10);
    expect(snap(15)).toBe(20);
    expect(snap(-4)).toBe(-0);
  });

  it("normiert Winkel auf 0–359°", () => {
    expect(normalizeRotation(-15)).toBe(345);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(735)).toBe(15);
  });

  it("berechnet die Hülle eines gedrehten Tisches", () => {
    const b = rotatedBounds(table({ rotation: 90 }));
    // 80 × 60 um 90° gedreht → 60 × 80, Mitte bleibt (140, 130)
    expect(b.width).toBeCloseTo(60);
    expect(b.height).toBeCloseTo(80);
    expect(b.x + b.width / 2).toBeCloseTo(140);
    expect(b.y + b.height / 2).toBeCloseTo(130);
  });

  it("ordnet einen Punkt dem kleinsten umgebenden Bereich zu", () => {
    const hall = area("hall", 0, 0, 800, 600);
    const niche = area("niche", 500, 400, 200, 150);
    expect(areaAt([hall, niche], { x: 550, y: 450 })?.id).toBe("niche");
    expect(areaAt([hall, niche], { x: 100, y: 100 })?.id).toBe("hall");
    expect(areaAt([hall, niche], { x: 900, y: 100 })).toBeNull();
  });

  it("findet einen freien Platz ohne Überschneidung", () => {
    const a = area("a", 0, 0, 400, 300);
    const occupied = [table({ x: 20, y: 20, width: 80, height: 80 })];
    const spot = findFreeSpot(a, { width: 80, height: 80 }, occupied);
    const overlaps = spot.x < 20 + 80 + 20 && spot.y < 20 + 80 + 20;
    expect(overlaps).toBe(false);
    expect(spot.x + 80).toBeLessThanOrEqual(400);
  });

  it("legt einen Tisch in die Mitte, wenn der Bereich voll ist", () => {
    const a = area("a", 0, 0, 100, 100);
    expect(findFreeSpot(a, { width: 80, height: 80 }, [])).toEqual({ x: 10, y: 10 });
  });

  it("vergrößert die Leinwand passend, ignoriert unplatzierte Tische", () => {
    expect(canvasSize([], [table({ x: 0, y: 0 })])).toEqual({ width: 1000, height: 640 });
    const size = canvasSize([area("a", 0, 0, 1200, 500)], [table({ x: 900, y: 700 })]);
    expect(size).toEqual({ width: 1280, height: 840 });
  });

  it("begrenzt Tischmaße und erzwingt gleiche Seiten bei runden Tischen", () => {
    const t = sanitizeTable(table({ x: -50, y: 9999, width: 5, height: 1000, rotation: -90, shape: "RECT" }));
    expect(t).toMatchObject({ x: 0, y: 5000, width: 30, height: 400, rotation: 270 });
    expect(sanitizeTable(table({ width: 60, height: 90, shape: "ROUND" }))).toMatchObject({ width: 90, height: 90 });
  });

  it("begrenzt Bereichsmaße", () => {
    expect(sanitizeArea(area("a", -10, 20.4, 10, 99999))).toMatchObject({ x: 0, y: 20, width: 80, height: 5000 });
  });
});

describe("Verlauf (Rückgängig/Wiederholen)", () => {
  it("fasst einen Ziehvorgang zu einem Schritt zusammen", () => {
    let h = initHistory(0);
    const start = h.present;
    for (const v of [1, 2, 3]) h = historyReducer(h, { type: "preview", update: () => v });
    h = historyReducer(h, { type: "settle", from: start });
    expect(h).toEqual({ past: [0], present: 3, future: [] });

    h = historyReducer(h, { type: "commit", update: (v) => v + 1 });
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(0);
    h = historyReducer(h, { type: "redo" });
    expect(h).toEqual({ past: [0], present: 3, future: [4] });

    // Neue Änderung verwirft den Wiederholen-Zweig
    h = historyReducer(h, { type: "commit", update: () => 9 });
    expect(h.future).toEqual([]);
  });

  it("ignoriert Ziehvorgänge ohne Änderung und begrenzt den Verlauf", () => {
    let h = initHistory(0);
    h = historyReducer(h, { type: "settle", from: h.present });
    expect(h.past).toEqual([]);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = historyReducer(h, { type: "commit", update: () => i });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});

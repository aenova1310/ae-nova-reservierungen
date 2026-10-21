import { describe, expect, it } from "vitest";
import type { PlanArea, PlanTable } from "@/lib/floorplan";
import { formatMin, layoutForView, occupancyCurve, tableSnapshot, type LiveReservation } from "@/lib/service-view";

const res = (over: Partial<LiveReservation>): LiveReservation => ({
  id: "r",
  code: "ABC123",
  guestName: "Gast",
  guestPhone: null,
  partySize: 2,
  status: "CONFIRMED",
  source: "ONLINE",
  hasNotes: false,
  startMin: 19 * 60,
  endMin: 19 * 60 + 105,
  blockedMin: 19 * 60 + 120,
  tableIds: ["t1"],
  allowed: [],
  ...over,
});

describe("Tischzustand im Live-Tischplan", () => {
  const evening = res({ id: "a" });

  it("frei, bald, erwartet, verspätet, Puffer", () => {
    expect(tableSnapshot([evening], 17 * 60).state).toBe("free");
    expect(tableSnapshot([evening], 18 * 60 + 15)).toMatchObject({ state: "soon", next: evening });
    expect(tableSnapshot([evening], 19 * 60 + 5)).toMatchObject({ state: "expected", current: evening });
    expect(tableSnapshot([evening], 19 * 60 + 20).state).toBe("late");
    expect(tableSnapshot([evening], 19 * 60 + 110)).toMatchObject({ state: "turnover", current: evening });
    expect(tableSnapshot([evening], 21 * 60).state).toBe("free");
  });

  it("eingetroffene Gäste sitzen – auch etwas länger als geplant", () => {
    const seated = res({ status: "ARRIVED" });
    expect(tableSnapshot([seated], 19 * 60 + 30).state).toBe("seated");
    expect(tableSnapshot([seated], 19 * 60 + 110).state).toBe("seated");
  });

  it("Anfragen sind erkennbar, No-Shows geben den Tisch frei", () => {
    expect(tableSnapshot([res({ status: "REQUESTED" })], 19 * 60 + 30).state).toBe("requested");
    expect(tableSnapshot([res({ status: "NO_SHOW" })], 19 * 60 + 30).state).toBe("free");
  });

  it("zeigt bei laufender Reservierung schon die nächste", () => {
    const later = res({ id: "b", startMin: 21 * 60 + 30, endMin: 23 * 60, blockedMin: 23 * 60 + 15 });
    expect(tableSnapshot([later, evening], 19 * 60 + 30)).toMatchObject({ current: evening, next: later });
  });
});

describe("Auslastungskurve", () => {
  it("zählt Tische (Kombinationen einmal je Tisch) und Gäste je Abschnitt", () => {
    const curve = occupancyCurve(
      [res({ tableIds: ["t1", "t2"], partySize: 6 }), res({ id: "b", tableIds: ["t3"], startMin: 20 * 60, endMin: 21 * 60 })],
      19 * 60,
      21 * 60,
      60,
    );
    expect(curve).toEqual([
      { min: 19 * 60, tables: 2, guests: 6 },
      { min: 20 * 60, tables: 3, guests: 8 },
    ]);
  });
});

describe("Anordnung ohne Raumplan", () => {
  const area = (id: string): PlanArea => ({ id, name: id, x: 0, y: 0, width: 800, height: 600, color: null });
  const table = (id: string, areaId: string, x = 0, y = 0): PlanTable => ({
    id, name: id, areaId, x, y, width: 80, height: 60, rotation: 0, shape: "RECT", minCapacity: 1, maxCapacity: 4, active: true,
  });

  it("legt Bereiche untereinander und Tische ohne Überschneidung an", () => {
    const { areas, tables } = layoutForView([area("a"), area("b")], [table("1", "a"), table("2", "a"), table("3", "b")]);
    expect(areas[1].y).toBeGreaterThan(areas[0].y + areas[0].height);
    expect(tables[0].x).not.toBe(tables[1].x);
    const t3 = tables.find((t) => t.id === "3")!;
    expect(t3.y).toBeGreaterThan(areas[1].y);
  });

  it("lässt platzierte Tische unverändert", () => {
    const placed = table("1", "a", 300, 200);
    const { tables } = layoutForView([area("a")], [placed, table("2", "a")]);
    expect(tables[0]).toEqual(placed);
    expect(tables[1].x === 0 && tables[1].y === 0).toBe(false);
  });

  it("formatiert Minuten auch nach Mitternacht", () => {
    expect(formatMin(19 * 60 + 5)).toBe("19:05");
    expect(formatMin(25 * 60 + 15)).toBe("01:15");
  });
});

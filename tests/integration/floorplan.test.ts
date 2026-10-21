import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { FloorplanError, loadFloorplan, saveFloorplan } from "@/server/floorplan/service";
import { FeatureNotInPlanError } from "@/server/plans/features";
import { createRestaurant, resetDatabase } from "../support/factory";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

async function setup(slug = "plan") {
  const r = await createRestaurant(slug, [
    { name: "T1", min: 1, max: 2 },
    { name: "T2", min: 2, max: 4 },
  ]);
  const user = await db.user.create({ data: { email: `${slug}@owner.test`, passwordHash: "x" } });
  return { ...r, pro: { id: r.restaurant.id, planCode: "PRO" as const }, userId: user.id };
}

/** Plan im Format, das der Editor sendet. */
async function payloadFor(restaurantId: string) {
  const plan = await loadFloorplan(restaurantId);
  return {
    baseVersion: plan.version,
    areas: plan.areas,
    tables: plan.tables.map(({ id, areaId, x, y, width, height, rotation, shape }) => ({ id, areaId, x, y, width, height, rotation, shape })),
  };
}

describe("Raumplan speichern", () => {
  it("ist im Basic-Tarif serverseitig gesperrt", async () => {
    const { restaurant, userId } = await setup();
    const payload = await payloadFor(restaurant.id);
    await expect(saveFloorplan({ id: restaurant.id, planCode: "BASIC" }, payload, userId)).rejects.toBeInstanceOf(FeatureNotInPlanError);
  });

  it("speichert Geometrie, normiert Werte und legt neue Bereiche an", async () => {
    const { pro, tables, userId } = await setup();
    const payload = await payloadFor(pro.id);
    payload.areas.push({ id: "new:1", name: "Terrasse", x: 900, y: 0, width: 400, height: 300, color: "#EEF2EA" });
    payload.tables[0] = { ...payload.tables[0], x: 120.4, y: 80, width: 70, height: 50, rotation: -45, shape: "ROUND" };
    payload.tables[1] = { ...payload.tables[1], areaId: "new:1", x: 950, y: 40 };

    const saved = await saveFloorplan(pro, payload, userId);
    const terrace = saved.areas.find((a) => a.name === "Terrasse")!;
    expect(terrace.id).not.toMatch(/^new:/);
    const t1 = saved.tables.find((t) => t.id === tables[0].id)!;
    expect(t1).toMatchObject({ x: 120, y: 80, width: 70, height: 70, rotation: 315, shape: "ROUND" });
    expect(saved.tables.find((t) => t.id === tables[1].id)!.areaId).toBe(terrace.id);
    expect(saved.version).not.toBe(payload.baseVersion);

    const log = await db.auditLog.findFirst({ where: { action: "floorplan.saved" } });
    expect(log?.meta).toMatchObject({ newAreas: 1, tablesMovedArea: 1 });
  });

  it("lehnt veraltete Stände ab (gleichzeitige Bearbeitung)", async () => {
    const { pro, area, userId } = await setup();
    const payload = await payloadFor(pro.id);
    // Jemand legt zwischenzeitlich einen Tisch an
    await db.table.create({ data: { restaurantId: pro.id, areaId: area.id, name: "T3", maxCapacity: 2 } });
    await expect(saveFloorplan(pro, payload, userId)).rejects.toThrow(/zwischenzeitlich geändert/);
  });

  it("akzeptiert keine Tische oder Bereiche eines anderen Restaurants", async () => {
    const own = await setup("eigen");
    const other = await setup("fremd");
    const payload = await payloadFor(own.pro.id);

    // Fremder Bereich als Ziel
    const foreignArea = { ...payload, tables: payload.tables.map((t, i) => (i === 0 ? { ...t, areaId: other.area.id } : t)) };
    await expect(saveFloorplan(own.pro, foreignArea, own.userId)).rejects.toBeInstanceOf(FloorplanError);

    // Fremder Tisch statt eigenem
    const foreignTable = { ...payload, tables: [{ ...payload.tables[0], id: other.tables[0].id }, payload.tables[1]] };
    await expect(saveFloorplan(own.pro, foreignTable, own.userId)).rejects.toBeInstanceOf(FloorplanError);

    // Fremder Bereich in der Bereichsliste
    const foreignAreaRow = { ...payload, areas: [...payload.areas, { ...payload.areas[0], id: other.area.id, name: "X" }] };
    await expect(saveFloorplan(own.pro, foreignAreaRow, own.userId)).rejects.toBeInstanceOf(FloorplanError);

    // Nichts wurde verändert
    expect((await db.table.findUniqueOrThrow({ where: { id: other.tables[0].id } })).areaId).toBe(other.area.id);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("verlangt den vollständigen Plan und eindeutige Bereichsnamen", async () => {
    const { pro, userId } = await setup();
    const payload = await payloadFor(pro.id);
    await expect(saveFloorplan(pro, { ...payload, tables: payload.tables.slice(1) }, userId)).rejects.toThrow(/fehlender Tisch/);
    const dup = { ...payload, areas: [...payload.areas, { ...payload.areas[0], id: "new:x", name: payload.areas[0].name.toUpperCase() }] };
    await expect(saveFloorplan(pro, dup, userId)).rejects.toThrow(/doppelt/);
  });

  it("weist ungültige Eingaben per Schema ab", async () => {
    const { pro, userId } = await setup();
    const payload = await payloadFor(pro.id);
    await expect(saveFloorplan(pro, { ...payload, areas: [{ ...payload.areas[0], color: "red; background:url(x)" }] }, userId)).rejects.toThrow();
    await expect(saveFloorplan(pro, { ...payload, tables: [{ ...payload.tables[0], x: Number.NaN }, payload.tables[1]] }, userId)).rejects.toThrow();
  });
});

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
    tables: plan.tables
      .filter((t) => t.active)
      .map(({ id, areaId, x, y, width, height, rotation, shape, name, minCapacity, maxCapacity, onlineBookable }) => ({
        id,
        areaId,
        x,
        y,
        width,
        height,
        rotation,
        shape,
        name,
        minCapacity,
        maxCapacity,
        onlineBookable: onlineBookable ?? true,
      })),
  };
}

const tableAt = (y: number, over: Record<string, unknown> = {}) => ({
  x: 100, y, width: 80, height: 80, rotation: 0, shape: "SQUARE" as const, minCapacity: 2, maxCapacity: 4, onlineBookable: true, ...over,
});

async function bookOn(restaurantId: string, tableId: string, startsAt: Date) {
  const r = await db.reservation.create({
    data: { restaurantId, code: Math.random().toString(36).slice(2, 8).toUpperCase(), status: "CONFIRMED", source: "PHONE", partySize: 2, startsAt, endsAt: new Date(startsAt.getTime() + 90 * 60_000) },
  });
  await db.reservationTable.create({ data: { restaurantId, reservationId: r.id, tableId, startsAt, blockedUntil: new Date(startsAt.getTime() + 105 * 60_000) } });
  return r;
}

describe("Tische im Editor anlegen, ändern, löschen", () => {
  it("legt neue Tische an und übernimmt Name, Plätze und Online-Buchbarkeit", async () => {
    const { pro, area, userId } = await setup();
    const payload = await payloadFor(pro.id);
    payload.tables.push({ id: "newt:1", areaId: area.id, name: "Fenster 1", ...tableAt(300, { minCapacity: 1, maxCapacity: 2, onlineBookable: false, shape: "ROUND" }) });
    payload.tables[0] = { ...payload.tables[0], name: "Bar", maxCapacity: 3 };
    const saved = await saveFloorplan(pro, payload, userId);
    expect(saved.tables.find((t) => t.name === "Fenster 1")).toMatchObject({ minCapacity: 1, maxCapacity: 2, onlineBookable: false, shape: "ROUND", active: true });
    expect(saved.tables.find((t) => t.name === "Bar")).toMatchObject({ maxCapacity: 3 });
    expect(saved.tables.some((t) => t.id.startsWith("newt:"))).toBe(false);
  });

  it("tauscht Tischnamen ohne Konflikt und prüft die Reihenfolge der Plätze", async () => {
    const { pro, userId } = await setup();
    const payload = await payloadFor(pro.id);
    const [a, b] = payload.tables;
    payload.tables = [{ ...a, name: b.name }, { ...b, name: a.name }];
    const saved = await saveFloorplan(pro, payload, userId);
    expect(saved.tables.find((t) => t.id === a.id)?.name).toBe(b.name);
    const bad = await payloadFor(pro.id);
    bad.tables[0] = { ...bad.tables[0], minCapacity: 5, maxCapacity: 2 };
    await expect(saveFloorplan(pro, bad, userId)).rejects.toThrow("fp.err.capacityOrder");
  });

  it("löscht Tische ohne Historie, deaktiviert Tische mit Historie, schützt kommende Reservierungen", async () => {
    const { pro, tables, userId } = await setup();
    const [t1, t2] = tables;
    // T1: Buchung in der Vergangenheit → wird deaktiviert; T2: ohne Historie → wird gelöscht
    await bookOn(pro.id, t1.id, new Date(Date.now() - 3 * 86_400_000));
    const payload = await payloadFor(pro.id);
    const saved = await saveFloorplan(pro, { ...payload, tables: [] }, userId);
    expect(saved.tables.find((t) => t.id === t1.id)).toMatchObject({ active: false });
    expect(saved.tables.find((t) => t.id === t2.id)).toBeUndefined();

    // Der Name des deaktivierten Tisches ist sofort wieder frei (auch in derselben Speicherung)
    expect(saved.tables.find((t) => t.id === t1.id)?.name).not.toBe(t1.name);
    const again = await payloadFor(pro.id);
    again.tables.push({ id: "newt:x", areaId: again.areas[0].id, name: t1.name, ...tableAt(100) });
    const reused = await saveFloorplan(pro, again, userId);
    expect(reused.tables.find((t) => t.name === t1.name)).toMatchObject({ active: true });
  });

  it("verhindert das Löschen bei kommenden Reservierungen", async () => {
    const { pro, tables, userId } = await setup();
    await bookOn(pro.id, tables[0].id, new Date(Date.now() + 2 * 86_400_000));
    const payload = await payloadFor(pro.id);
    await expect(saveFloorplan(pro, { ...payload, tables: payload.tables.slice(1) }, userId)).rejects.toThrow("fp.err.tableHasReservations");
    expect(await db.table.count({ where: { id: tables[0].id, active: true } })).toBe(1);
  });

  it("löscht einen Tisch mit Historie und vergibt seinen Namen in derselben Speicherung neu", async () => {
    const { pro, tables, userId } = await setup();
    await bookOn(pro.id, tables[1].id, new Date(Date.now() - 86_400_000));
    const payload = await payloadFor(pro.id);
    const keep = payload.tables.filter((t) => t.id !== tables[1].id);
    keep.push({ id: "newt:n", areaId: payload.areas[0].id, name: tables[1].name, ...tableAt(250) });
    const saved = await saveFloorplan(pro, { ...payload, tables: keep }, userId);
    expect(saved.tables.filter((t) => t.active).map((t) => t.name).sort()).toEqual([tables[0].name, tables[1].name].sort());

    // Bereich entfernen und gleichnamigen neu anlegen – ebenfalls in einer Speicherung
    await db.area.create({ data: { restaurantId: pro.id, name: "Bar" } });
    const p2 = await payloadFor(pro.id);
    const areas = [...p2.areas.filter((a) => a.name !== "Bar"), { id: "new:b", name: "Bar", x: 900, y: 0, width: 300, height: 200, color: null }];
    const s2 = await saveFloorplan(pro, { ...p2, areas }, userId);
    expect(s2.areas.filter((a) => a.name === "Bar")).toHaveLength(1);
  });

  it("entfernt nur leere Bereiche", async () => {
    const { pro, userId } = await setup();
    await db.area.create({ data: { restaurantId: pro.id, name: "Leer" } });
    const payload = await payloadFor(pro.id);
    const saved = await saveFloorplan(pro, { ...payload, areas: payload.areas.filter((a) => a.name !== "Leer") }, userId);
    expect(saved.areas.map((a) => a.name)).not.toContain("Leer");
    const p2 = await payloadFor(pro.id);
    await expect(saveFloorplan(pro, { ...p2, areas: [], tables: p2.tables }, userId)).rejects.toThrow();
  });
});

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
    await expect(saveFloorplan(pro, payload, userId)).rejects.toThrow("fp.err.changed");
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

  it("verlangt eindeutige Namen", async () => {
    const { pro, userId } = await setup();
    const payload = await payloadFor(pro.id);
    const dupTable = { ...payload, tables: payload.tables.map((t) => ({ ...t, name: "x" })) };
    await expect(saveFloorplan(pro, dupTable, userId)).rejects.toThrow("fp.err.duplicateTable");
    const dup = { ...payload, areas: [...payload.areas, { ...payload.areas[0], id: "new:x", name: payload.areas[0].name.toUpperCase() }] };
    await expect(saveFloorplan(pro, dup, userId)).rejects.toThrow("fp.err.duplicateArea");
  });

  it("erlaubt das Tauschen von Bereichsnamen", async () => {
    const { pro, userId } = await setup();
    await db.area.create({ data: { restaurantId: pro.id, name: "Terrasse" } });
    const payload = await payloadFor(pro.id);
    const names = payload.areas.map((a) => a.name);
    payload.areas = payload.areas.map((a, i) => ({ ...a, name: names[1 - i] }));
    const saved = await saveFloorplan(pro, payload, userId);
    expect(saved.areas.map((a) => a.name).sort()).toEqual([...names].sort());
    expect(saved.areas.find((a) => a.id === payload.areas[0].id)!.name).toBe(names[1]);
  });

  it("weist ungültige Eingaben per Schema ab", async () => {
    const { pro, userId } = await setup();
    const payload = await payloadFor(pro.id);
    await expect(saveFloorplan(pro, { ...payload, areas: [{ ...payload.areas[0], color: "red; background:url(x)" }] }, userId)).rejects.toThrow();
    await expect(saveFloorplan(pro, { ...payload, tables: [{ ...payload.tables[0], x: Number.NaN }, payload.tables[1]] }, userId)).rejects.toThrow();
  });
});

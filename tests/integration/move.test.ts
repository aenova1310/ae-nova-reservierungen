import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createReservation } from "@/server/reservations/create";
import { ReservationError } from "@/server/reservations/errors";
import { moveReservationTables, restoreTableAssignments } from "@/server/reservations/move";
import { createRestaurant, DATE, guest, NOW, resetDatabase } from "../support/factory";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

async function setup(slug = "umsetzen") {
  const r = await createRestaurant(slug, [
    { name: "T1", min: 1, max: 2 },
    { name: "T2", min: 1, max: 2 },
    { name: "T3", min: 2, max: 4 },
  ]);
  const user = await db.user.create({ data: { email: `${slug}@staff.test`, passwordHash: "x" } });
  const [t1, t2, t3] = r.tables;
  return { ...r, t1, t2, t3, userId: user.id };
}

const book = (restaurantId: string, time: string, n: number, party: number, tableId: string) =>
  createReservation({
    restaurantId, date: DATE, time, partySize: party, channel: "STAFF", source: "PHONE", guest: guest(n), privacyAcknowledged: true, now: NOW,
    choice: { kind: "table", id: tableId },
  });

const activeTables = async (reservationId: string) =>
  (await db.reservationTable.findMany({ where: { reservationId, active: true }, select: { tableId: true } })).map((x) => x.tableId).sort();

const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof ReservationError ? e.code : String(e)));

describe("Reservierung auf andere Tische setzen", () => {
  it("verschiebt auf einen freien Tisch, behält Zeiten und lässt sich zurückschieben", async () => {
    const { restaurant, t1, t2, userId } = await setup();
    const a = await book(restaurant.id, "19:00", 1, 2, t1.id);
    const before = await db.reservationTable.findFirstOrThrow({ where: { reservationId: a.id } });

    const moved = await moveReservationTables({ restaurantId: restaurant.id, reservationId: a.id, toTableIds: [t2.id], userId });
    expect(moved).toMatchObject({ fromTableIds: [t1.id], toTableIds: [t2.id], swapped: null });
    const after = await db.reservationTable.findFirstOrThrow({ where: { reservationId: a.id } });
    expect(after).toMatchObject({ tableId: t2.id, startsAt: before.startsAt, blockedUntil: before.blockedUntil, active: true });

    // Rückgängig: wieder auf T1 (eindeutiger Schlüssel Reservierung+Tisch darf nicht im Weg stehen)
    await moveReservationTables({ restaurantId: restaurant.id, reservationId: a.id, toTableIds: [t1.id], userId });
    expect(await activeTables(a.id)).toEqual([t1.id]);
    expect(await db.auditLog.count({ where: { action: "reservation.tables_moved", entityId: a.id } })).toBe(2);
  });

  it("lehnt belegte Tische ab und tauscht auf Wunsch", async () => {
    const { restaurant, t1, t2, userId } = await setup();
    const a = await book(restaurant.id, "19:00", 1, 2, t1.id);
    const b = await book(restaurant.id, "19:30", 2, 2, t2.id);

    expect(await code(moveReservationTables({ restaurantId: restaurant.id, reservationId: a.id, toTableIds: [t2.id], userId }))).toBe("TABLE_TAKEN");
    expect(await activeTables(a.id)).toEqual([t1.id]); // unverändert (Transaktion zurückgerollt)

    const swapped = await moveReservationTables({ restaurantId: restaurant.id, reservationId: a.id, toTableIds: [t2.id], swapWithId: b.id, userId });
    expect(swapped.swapped).toEqual({ reservationId: b.id, fromTableIds: [t2.id], toTableIds: [t1.id] });
    expect(await activeTables(a.id)).toEqual([t2.id]);
    expect(await activeTables(b.id)).toEqual([t1.id]);
  });

  it("Tausch mit einer Kombination: die andere behält ihre übrigen Tische, Rückgängig stellt alles genau her", async () => {
    const { restaurant, t1, t2, t3, userId } = await setup();
    const big = await book(restaurant.id, "19:00", 1, 4, t2.id);
    await moveReservationTables({ restaurantId: restaurant.id, reservationId: big.id, toTableIds: [t2.id, t3.id], userId });
    const small = await book(restaurant.id, "19:00", 2, 2, t1.id);

    // small auf t2 ziehen → Tausch: big gibt t2 ab, behält t3 und bekommt t1
    const moved = await moveReservationTables({ restaurantId: restaurant.id, reservationId: small.id, toTableIds: [t2.id], swapWithId: big.id, userId });
    expect(await activeTables(small.id)).toEqual([t2.id]);
    expect(await activeTables(big.id)).toEqual([t1.id, t3.id].sort());

    await restoreTableAssignments({
      restaurantId: restaurant.id,
      userId,
      assignments: [
        { reservationId: small.id, tableIds: moved.fromTableIds },
        { reservationId: big.id, tableIds: moved.swapped!.fromTableIds },
      ],
    });
    expect(await activeTables(small.id)).toEqual([t1.id]);
    expect(await activeTables(big.id)).toEqual([t2.id, t3.id].sort());
  });

  it("verlangt Bestätigung bei zu wenigen Plätzen und erlaubt Kombinationen", async () => {
    const { restaurant, t1, t2, t3, userId } = await setup();
    const big = await book(restaurant.id, "19:00", 1, 4, t3.id);
    expect(await code(moveReservationTables({ restaurantId: restaurant.id, reservationId: big.id, toTableIds: [t1.id], userId }))).toBe("CAPACITY");
    await moveReservationTables({ restaurantId: restaurant.id, reservationId: big.id, toTableIds: [t1.id, t2.id], userId });
    expect(await activeTables(big.id)).toEqual([t1.id, t2.id].sort());
    await moveReservationTables({ restaurantId: restaurant.id, reservationId: big.id, toTableIds: [t1.id], userId, allowOverCapacity: true });
    expect(await activeTables(big.id)).toEqual([t1.id]);
  });

  it("akzeptiert nur eigene, aktive Tische und verschiebbare Reservierungen", async () => {
    const own = await setup("eigen");
    const other = await setup("fremd");
    const a = await book(own.restaurant.id, "19:00", 1, 2, own.t1.id);
    expect(await code(moveReservationTables({ restaurantId: own.restaurant.id, reservationId: a.id, toTableIds: [other.t2.id], userId: own.userId }))).toBe("INVALID_CHOICE");
    // Fremde Reservierung über das eigene Restaurant: nicht gefunden
    const b = await book(other.restaurant.id, "19:00", 2, 2, other.t1.id);
    expect(await code(moveReservationTables({ restaurantId: own.restaurant.id, reservationId: b.id, toTableIds: [own.t2.id], userId: own.userId }))).toBe("NOT_FOUND");

    await db.reservation.update({ where: { id: a.id }, data: { status: "NO_SHOW" } });
    expect(await code(moveReservationTables({ restaurantId: own.restaurant.id, reservationId: a.id, toTableIds: [own.t2.id], userId: own.userId }))).toBe("NOT_MOVABLE");
  });
});

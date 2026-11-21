import "server-only";
import { db, type Tx } from "../db";
import { lockRestaurant } from "./create";
import { isOverlapViolation, ReservationError } from "./errors";

/**
 * Reservierung im Service auf andere Tische setzen – per Ziehen im Tischplan
 * oder über „Tisch wechseln“. Optional mit Tausch: Die Reservierung auf dem
 * Zieltisch bekommt dann die bisherigen Tische.
 *
 * Sicherheit gegen Doppelbelegung liefert weiterhin der Exclusion-Constraint
 * der Datenbank (gleiche Transaktion, Restaurant-Sperre). Zu kleine Tische
 * sind erlaubt, aber nur nach ausdrücklicher Bestätigung (`allowOverCapacity`).
 * Die Uhrzeit ändert sich nicht – deshalb keine Mail an den Gast.
 */
const MOVABLE = ["PENDING_PAYMENT", "REQUESTED", "CONFIRMED", "ARRIVED"] as const;

export interface MoveResult {
  /** Vorherige Tische (für „Rückgängig“). */
  fromTableIds: string[];
  toTableIds: string[];
  swapped: { reservationId: string; toTableIds: string[] } | null;
}

async function loadMovable(tx: Tx, restaurantId: string, reservationId: string) {
  const r = await tx.reservation.findFirst({
    where: { id: reservationId, restaurantId },
    select: { id: true, status: true, partySize: true, startsAt: true, endsAt: true, tables: { where: { active: true }, select: { tableId: true, startsAt: true, blockedUntil: true } } },
  });
  if (!r) throw new ReservationError("NOT_FOUND");
  if (!(MOVABLE as readonly string[]).includes(r.status)) throw new ReservationError("NOT_MOVABLE");
  if (r.tables.length === 0) throw new ReservationError("NOT_MOVABLE"); // Tische bereits freigegeben
  return r;
}

async function assign(tx: Tx, restaurantId: string, r: Awaited<ReturnType<typeof loadMovable>>, tableIds: string[]) {
  // Zeitfenster der bisherigen Belegung übernehmen (inkl. Puffer bzw. vorzeitiger Freigabe)
  const startsAt = r.tables[0].startsAt;
  const blockedUntil = new Date(Math.max(...r.tables.map((t) => t.blockedUntil.getTime())));
  // Alte Zeilen löschen statt deaktivieren: (Reservierung, Tisch) ist eindeutig, ein Zurückschieben muss möglich sein
  await tx.reservationTable.deleteMany({ where: { reservationId: r.id, restaurantId } });
  await tx.reservationTable.createMany({
    data: tableIds.map((tableId) => ({ restaurantId, reservationId: r.id, tableId, startsAt, blockedUntil, active: true })),
  });
}

export async function moveReservationTables(params: {
  restaurantId: string;
  reservationId: string;
  toTableIds: string[];
  userId: string;
  /** Reservierung auf dem Zieltisch, die im Tausch die bisherigen Tische bekommt. */
  swapWithId?: string | null;
  allowOverCapacity?: boolean;
}): Promise<MoveResult> {
  const toTableIds = [...new Set(params.toTableIds)];
  if (toTableIds.length === 0 || toTableIds.length > 8) throw new ReservationError("INVALID_CHOICE");

  try {
    return await db.$transaction(async (tx) => {
      await lockRestaurant(tx, params.restaurantId);
      const r = await loadMovable(tx, params.restaurantId, params.reservationId);

      // Nur aktive Tische des eigenen Restaurants
      const tables = await tx.table.findMany({
        where: { id: { in: toTableIds }, restaurantId: params.restaurantId, active: true },
        select: { id: true, maxCapacity: true },
      });
      if (tables.length !== toTableIds.length) throw new ReservationError("INVALID_CHOICE");
      const seats = tables.reduce((s, t) => s + t.maxCapacity, 0);
      if (seats < r.partySize && !params.allowOverCapacity) throw new ReservationError("CAPACITY");

      const fromTableIds = r.tables.map((t) => t.tableId);
      if (fromTableIds.length === toTableIds.length && fromTableIds.every((id) => toTableIds.includes(id))) {
        return { fromTableIds, toTableIds, swapped: null };
      }

      let swapped: MoveResult["swapped"] = null;
      if (params.swapWithId) {
        const other = await loadMovable(tx, params.restaurantId, params.swapWithId);
        if (other.id === r.id || !other.tables.some((t) => toTableIds.includes(t.tableId))) throw new ReservationError("INVALID_CHOICE");
        const otherSeats = (await tx.table.findMany({ where: { id: { in: fromTableIds } }, select: { maxCapacity: true } })).reduce((s, t) => s + t.maxCapacity, 0);
        if (otherSeats < other.partySize && !params.allowOverCapacity) throw new ReservationError("CAPACITY");
        // Erst beide lösen, dann neu setzen – sonst blockieren sie sich gegenseitig
        await tx.reservationTable.deleteMany({ where: { reservationId: other.id, restaurantId: params.restaurantId } });
        await assign(tx, params.restaurantId, r, toTableIds);
        await assign(tx, params.restaurantId, other, fromTableIds);
        swapped = { reservationId: other.id, toTableIds: fromTableIds };
      } else {
        await assign(tx, params.restaurantId, r, toTableIds);
      }

      await tx.auditLog.create({
        data: {
          restaurantId: params.restaurantId,
          userId: params.userId,
          action: swapped ? "reservation.tables_swapped" : "reservation.tables_moved",
          entityId: r.id,
          meta: { from: fromTableIds, to: toTableIds, swapWith: swapped?.reservationId ?? null, overCapacity: seats < r.partySize },
        },
      });
      return { fromTableIds, toTableIds, swapped };
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new ReservationError("TABLE_TAKEN");
    throw error;
  }
}

import "server-only";
import { db, type Tx } from "../db";
import { resolveBooking } from "../availability";
import { loadAvailabilityContext, loadRestaurantConfig, OPEN_STATUSES } from "../availability/load";
import { isLocalDate, isLocalTime, localToUtc, parseTime, type LocalDate, type LocalTime } from "../availability/time";
import { hashToken } from "../crypto";
import { enqueueEmail } from "../email/outbox";
import { isOverlapViolation, ReservationError } from "./errors";
import { expireStaleHolds, lockRestaurant } from "./create";
import { looksLikeManageToken } from "./tokens";

/** Reservierung über den Verwaltungslink laden (ohne Login). */
export async function findReservationByToken(token: string) {
  if (!looksLikeManageToken(token)) return null;
  return db.reservation.findUnique({
    where: { manageTokenHash: hashToken(token) },
    include: {
      restaurant: { select: { id: true, slug: true, name: true, timezone: true, phone: true, email: true, status: true } },
      tables: { where: { active: true }, include: { table: { select: { name: true, areaId: true } } } },
      payment: { select: { id: true, status: true } },
    },
  });
}

export type ManagedReservation = NonNullable<Awaited<ReturnType<typeof findReservationByToken>>>;

const isOpen = (status: string) => (OPEN_STATUSES as readonly string[]).includes(status);

/** Kann der Gast diese Reservierung jetzt noch stornieren? (bis zum Reservierungszeitpunkt) */
export function guestCanCancel(r: { status: string; startsAt: Date }, now = new Date()): boolean {
  return isOpen(r.status) && now < r.startsAt;
}

/** Tische freigeben und Status setzen – gemeinsame Logik für alle Storno-Wege. */
async function releaseTables(tx: Tx, reservationId: string) {
  await tx.reservationTable.updateMany({ where: { reservationId }, data: { active: false } });
}

export async function cancelReservation(params: {
  reservationId: string;
  restaurantId: string;
  by: "GUEST" | "RESTAURANT";
  reason?: string | null;
  userId?: string | null;
  notifyGuest?: boolean;
  now?: Date;
}): Promise<{ emailIds: string[] }> {
  const now = params.now ?? new Date();
  return db.$transaction(async (tx) => {
    await lockRestaurant(tx, params.restaurantId);
    const r = await tx.reservation.findFirst({
      where: { id: params.reservationId, restaurantId: params.restaurantId },
      select: { id: true, status: true, startsAt: true, guestEmail: true },
    });
    if (!r) throw new ReservationError("NOT_FOUND");
    if (params.by === "GUEST" ? !guestCanCancel(r, now) : !isOpen(r.status)) {
      throw new ReservationError("NOT_CANCELLABLE");
    }

    await tx.reservation.update({
      where: { id: r.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledBy: params.by,
        cancelReason: params.reason?.trim().slice(0, 500) || null,
        icsSequence: { increment: 1 },
      },
    });
    await releaseTables(tx, r.id);

    const ref = { restaurantId: params.restaurantId, reservationId: r.id };
    const emailIds: string[] = [];
    if (params.by === "GUEST") {
      if (r.guestEmail) emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESERVATION_CANCELLED_GUEST" }));
      emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESTAURANT_CANCELLATION" }));
    } else if (r.guestEmail && params.notifyGuest !== false) {
      emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESERVATION_CANCELLED_RESTAURANT" }));
    }

    await tx.auditLog.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId ?? null,
        action: "reservation.cancelled",
        entityId: r.id,
        meta: { by: params.by },
      },
    });
    return { emailIds };
  });
}

/**
 * Umbuchung durch den Gast (Datum/Uhrzeit/Personen) in EINER Transaktion:
 * neuer Slot wird belegt, alter freigegeben. Schlägt die Prüfung fehl, bleibt
 * die bestehende Reservierung unverändert.
 */
export async function modifyReservation(params: {
  reservationId: string;
  restaurantId: string;
  date: LocalDate;
  time: LocalTime;
  partySize: number;
  by: "GUEST" | "RESTAURANT";
  userId?: string | null;
  now?: Date;
}): Promise<{ startsAt: Date; endsAt: Date; status: string; emailIds: string[] }> {
  const now = params.now ?? new Date();
  if (!isLocalDate(params.date) || !isLocalTime(params.time)) throw new ReservationError("INVALID_TIME");

  try {
    return await db.$transaction(
      async (tx) => {
        await lockRestaurant(tx, params.restaurantId);
        const r = await tx.reservation.findFirst({
          where: { id: params.reservationId, restaurantId: params.restaurantId },
          include: { payment: { select: { id: true } }, tables: { where: { active: true }, include: { table: true } } },
        });
        if (!r) throw new ReservationError("NOT_FOUND");
        if (params.by === "GUEST" && !guestCanCancel(r, now)) throw new ReservationError("NOT_MODIFIABLE");
        // Anzahlungen (Phase 2): Betrag hängt an der Personenzahl → online nur Storno.
        if (r.payment && params.by === "GUEST") throw new ReservationError("PAYMENT_LOCKED");

        const config = await loadRestaurantConfig(tx, params.restaurantId);
        const start = localToUtc(params.date, parseTime(params.time), config.rules.timezone);
        if (!start) throw new ReservationError("INVALID_TIME");

        await expireStaleHolds(tx, params.restaurantId, now);
        const ctx = await loadAvailabilityContext(tx, config, params.date, now);
        const currentArea = r.tables[0]?.table.areaId ?? null;
        const channel = params.by === "GUEST" && r.source === "ONLINE" ? "ONLINE" : "STAFF";

        const base = {
          date: params.date,
          start,
          partySize: params.partySize,
          channel,
          ignoreReservationId: r.id,
        } as const;
        // Bevorzugt im bisherigen Bereich bleiben, sonst irgendwo.
        let resolution = resolveBooking(ctx, { ...base, areaId: currentArea });
        if (!resolution.ok && currentArea) resolution = resolveBooking(ctx, base);
        if (!resolution.ok) throw new ReservationError(resolution.code);

        const status = config.confirmationMode === "MANUAL" && params.by === "GUEST" ? "REQUESTED" : r.status;

        await tx.reservationTable.deleteMany({ where: { reservationId: r.id } });
        await tx.reservation.update({
          where: { id: r.id },
          data: {
            startsAt: resolution.start,
            endsAt: resolution.end,
            partySize: params.partySize,
            status,
            icsSequence: { increment: 1 },
            reminderSentAt: null,
          },
        });
        await tx.reservationTable.createMany({
          data: resolution.candidate.tableIds.map((tableId) => ({
            restaurantId: params.restaurantId,
            reservationId: r.id,
            tableId,
            startsAt: resolution.start,
            blockedUntil: resolution.blockedUntil,
          })),
        });

        const ref = { restaurantId: params.restaurantId, reservationId: r.id };
        const emailIds: string[] = [];
        if (r.guestEmail) emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESERVATION_MODIFIED" }));
        if (params.by === "GUEST") emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESTAURANT_RESERVATION_MODIFIED" }));

        await tx.auditLog.create({
          data: {
            restaurantId: params.restaurantId,
            userId: params.userId ?? null,
            action: "reservation.modified",
            entityId: r.id,
            meta: { by: params.by, from: r.startsAt.toISOString(), to: resolution.start.toISOString(), partySize: params.partySize },
          },
        });

        return { startsAt: resolution.start, endsAt: resolution.end, status, emailIds };
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (isOverlapViolation(error)) throw new ReservationError("TABLE_TAKEN");
    throw error;
  }
}

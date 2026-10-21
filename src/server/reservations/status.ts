import "server-only";
import { db } from "../db";
import { enqueueEmail } from "../email/outbox";
import { ReservationError } from "./errors";
import { lockRestaurant } from "./create";

export type ReservationStatus =
  | "PENDING_PAYMENT"
  | "REQUESTED"
  | "CONFIRMED"
  | "ARRIVED"
  | "NO_SHOW"
  | "CANCELLED"
  | "EXPIRED"
  | "DECLINED";

/**
 * Erlaubte Statuswechsel im Admin. Stornieren läuft über cancelReservation
 * (eigene Mails/Regeln). Rückwärtswechsel (z. B. versehentlich "No-Show")
 * sind erlaubt, solange der Tisch nicht freigegeben wurde.
 */
const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING_PAYMENT: [],
  REQUESTED: ["CONFIRMED", "DECLINED"],
  CONFIRMED: ["ARRIVED", "NO_SHOW"],
  ARRIVED: ["CONFIRMED", "NO_SHOW"],
  NO_SHOW: ["CONFIRMED", "ARRIVED"],
  CANCELLED: [],
  EXPIRED: [],
  DECLINED: [],
};

export function allowedTransitions(from: ReservationStatus): ReservationStatus[] {
  return TRANSITIONS[from];
}

/** Status, bei denen die Tische freigegeben werden. */
const RELEASING: ReservationStatus[] = ["DECLINED", "CANCELLED", "EXPIRED"];

export async function changeReservationStatus(params: {
  restaurantId: string;
  reservationId: string;
  to: ReservationStatus;
  userId: string;
  reason?: string | null;
  now?: Date;
}): Promise<{ emailIds: string[] }> {
  const now = params.now ?? new Date();
  return db.$transaction(async (tx) => {
    await lockRestaurant(tx, params.restaurantId);
    const r = await tx.reservation.findFirst({
      where: { id: params.reservationId, restaurantId: params.restaurantId },
      select: { id: true, status: true, guestEmail: true },
    });
    if (!r) throw new ReservationError("NOT_FOUND");
    if (!TRANSITIONS[r.status].includes(params.to)) throw new ReservationError("INVALID_TRANSITION");

    await tx.reservation.update({
      where: { id: r.id },
      data: {
        status: params.to,
        confirmedAt: params.to === "CONFIRMED" && r.status === "REQUESTED" ? now : undefined,
        arrivedAt: params.to === "ARRIVED" ? now : params.to === "CONFIRMED" ? null : undefined,
        cancelReason: params.to === "DECLINED" ? params.reason?.trim().slice(0, 500) || null : undefined,
      },
    });
    if (RELEASING.includes(params.to)) {
      await tx.reservationTable.updateMany({ where: { reservationId: r.id }, data: { active: false } });
    }

    const emailIds: string[] = [];
    const ref = { restaurantId: params.restaurantId, reservationId: r.id };
    if (r.guestEmail && r.status === "REQUESTED" && params.to === "CONFIRMED") {
      emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESERVATION_CONFIRMED" }));
    }
    if (r.guestEmail && params.to === "DECLINED") {
      emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESERVATION_DECLINED" }));
    }

    await tx.auditLog.create({
      data: {
        restaurantId: params.restaurantId,
        userId: params.userId,
        action: "reservation.status_changed",
        entityId: r.id,
        meta: { from: r.status, to: params.to },
      },
    });
    return { emailIds };
  });
}

/**
 * Tisch einer Reservierung vorzeitig freigeben (z. B. Gäste sind früher gegangen
 * oder No-Show steht fest). Setzt das Belegungsende auf "jetzt".
 */
export async function releaseTablesNow(params: { restaurantId: string; reservationId: string; userId: string; now?: Date }) {
  const now = params.now ?? new Date();
  await db.$transaction(async (tx) => {
    await lockRestaurant(tx, params.restaurantId);
    const rows = await tx.reservationTable.findMany({
      where: { reservationId: params.reservationId, restaurantId: params.restaurantId, active: true },
    });
    for (const row of rows) {
      if (row.startsAt >= now) {
        await tx.reservationTable.update({ where: { id: row.id }, data: { active: false } });
      } else if (row.blockedUntil > now) {
        await tx.reservationTable.update({ where: { id: row.id }, data: { blockedUntil: now } });
      }
    }
    await tx.auditLog.create({
      data: { restaurantId: params.restaurantId, userId: params.userId, action: "reservation.tables_released", entityId: params.reservationId },
    });
  });
}

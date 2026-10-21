import "server-only";
import { db, type Tx } from "../db";
import { resolveBooking, type BookingChannel } from "../availability";
import { loadAvailabilityContext, loadRestaurantConfig } from "../availability/load";
import { isLocalDate, isLocalTime, localToUtc, parseTime, type LocalDate, type LocalTime } from "../availability/time";
import { reservationCode } from "../crypto";
import { enqueueEmail } from "../email/outbox";
import { isOverlapViolation, ReservationError } from "./errors";
import { manageTokenHashFor } from "./tokens";

export type ReservationSource = "ONLINE" | "PHONE" | "WALK_IN" | "ADMIN";

export interface CreateReservationInput {
  restaurantId: string;
  date: LocalDate;
  time: LocalTime;
  partySize: number;
  channel: BookingChannel;
  source: ReservationSource;
  areaId?: string | null;
  choice?: { kind: "table" | "combination"; id: string } | null;
  guest: { name: string; email?: string | null; phone?: string | null; notes?: string | null };
  locale?: "de" | "en";
  /** Online Pflicht: Kenntnisnahme der Datenschutzhinweise. */
  privacyAcknowledged?: boolean;
  internalNotes?: string | null;
  createdById?: string | null;
  durationOverrideMinutes?: number | null;
  /** Personal: Bestätigungs-Mail an den Gast senden (Standard: ja, falls E-Mail vorhanden). */
  notifyGuest?: boolean;
  now?: Date;
}

export interface CreatedReservation {
  id: string;
  code: string;
  status: "PENDING_PAYMENT" | "REQUESTED" | "CONFIRMED" | "ARRIVED";
  startsAt: Date;
  endsAt: Date;
  tableNames: string[];
  areaId: string | null;
  emailIds: string[];
}

/** Sperrt Buchungen eines Restaurants für die Dauer der Transaktion (andere Restaurants laufen parallel). */
export async function lockRestaurant(tx: Tx, restaurantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}))`;
}

/** Gibt Tische unbezahlter, abgelaufener Holds frei (falls der Cron-Job noch nicht lief). */
export async function expireStaleHolds(tx: Tx, restaurantId: string, now: Date): Promise<number> {
  const stale = await tx.reservation.findMany({
    where: { restaurantId, status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;
  const ids = stale.map((r) => r.id);
  await tx.reservation.updateMany({
    where: { id: { in: ids } },
    data: { status: "EXPIRED", cancelledAt: now, cancelledBy: "SYSTEM" },
  });
  await tx.reservationTable.updateMany({ where: { reservationId: { in: ids } }, data: { active: false } });
  return ids.length;
}

async function uniqueCode(tx: Tx, restaurantId: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = reservationCode();
    const exists = await tx.reservation.findFirst({ where: { restaurantId, code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new ReservationError("CONFLICT", "Kein freier Buchungscode gefunden");
}

const clean = (v: string | null | undefined, max: number) => {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
};

export async function createReservation(input: CreateReservationInput): Promise<CreatedReservation> {
  const now = input.now ?? new Date();
  if (!isLocalDate(input.date) || !isLocalTime(input.time)) throw new ReservationError("INVALID_TIME");
  if (input.channel === "ONLINE" && !input.privacyAcknowledged) throw new ReservationError("CONSENT_REQUIRED");

  const guestName = clean(input.guest.name, 120);
  if (!guestName) throw new ReservationError("CONFLICT", "Name fehlt");
  const guestEmail = clean(input.guest.email, 254)?.toLowerCase() ?? null;

  try {
    return await db.$transaction(
      async (tx) => {
        await lockRestaurant(tx, input.restaurantId);

        const restaurant = await tx.restaurant.findUniqueOrThrow({
          where: { id: input.restaurantId },
          select: { status: true, timezone: true, settings: { select: { privacyNoticeVersion: true } } },
        });
        if (restaurant.status !== "ACTIVE") throw new ReservationError("RESTAURANT_SUSPENDED");

        const start = localToUtc(input.date, parseTime(input.time), restaurant.timezone);
        if (!start) throw new ReservationError("INVALID_TIME");

        await expireStaleHolds(tx, input.restaurantId, now);
        const config = await loadRestaurantConfig(tx, input.restaurantId);
        const ctx = await loadAvailabilityContext(tx, config, input.date, now);

        // Im Auto-Modus darf der Gast nur den Bereich wählen, keinen Tisch.
        const choice =
          input.channel === "ONLINE" && config.allocationMode === "AUTOMATIC" ? null : (input.choice ?? null);

        const resolution = resolveBooking(ctx, {
          date: input.date,
          start,
          partySize: input.partySize,
          channel: input.channel,
          areaId: input.areaId ?? null,
          choice,
          durationOverrideMinutes: input.durationOverrideMinutes ?? null,
        });
        if (!resolution.ok) throw new ReservationError(resolution.code);

        const status: CreatedReservation["status"] =
          input.channel === "ONLINE"
            ? config.confirmationMode === "MANUAL"
              ? "REQUESTED"
              : "CONFIRMED"
            : input.source === "WALK_IN"
              ? "ARRIVED"
              : "CONFIRMED";

        const reservation = await tx.reservation.create({
          data: {
            restaurantId: input.restaurantId,
            code: await uniqueCode(tx, input.restaurantId),
            status,
            source: input.source,
            partySize: input.partySize,
            startsAt: resolution.start,
            endsAt: resolution.end,
            areaPreferenceId: input.areaId ?? null,
            guestName,
            guestEmail,
            guestPhone: clean(input.guest.phone, 40),
            guestNotes: clean(input.guest.notes, 1000),
            internalNotes: clean(input.internalNotes, 1000),
            locale: input.locale ?? "de",
            privacyConsentAt: input.privacyAcknowledged ? now : null,
            privacyNoticeVersion: input.privacyAcknowledged ? (restaurant.settings?.privacyNoticeVersion ?? 1) : null,
            confirmedAt: status === "CONFIRMED" || status === "ARRIVED" ? now : null,
            arrivedAt: status === "ARRIVED" ? now : null,
            createdById: input.createdById ?? null,
          },
          select: { id: true, code: true, tokenVersion: true },
        });

        if (guestEmail) {
          await tx.reservation.update({
            where: { id: reservation.id },
            data: { manageTokenHash: manageTokenHashFor(reservation.id, reservation.tokenVersion) },
          });
        }

        await tx.reservationTable.createMany({
          data: resolution.candidate.tableIds.map((tableId) => ({
            restaurantId: input.restaurantId,
            reservationId: reservation.id,
            tableId,
            startsAt: resolution.start,
            blockedUntil: resolution.blockedUntil,
            active: true,
          })),
        });

        const emailIds: string[] = [];
        const ref = { restaurantId: input.restaurantId, reservationId: reservation.id };
        if (input.channel === "ONLINE") {
          if (guestEmail) {
            emailIds.push(
              await enqueueEmail(tx, { ...ref, type: status === "REQUESTED" ? "RESERVATION_REQUESTED" : "RESERVATION_CONFIRMED" }),
            );
          }
          emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESTAURANT_NEW_RESERVATION" }));
        } else if (guestEmail && input.notifyGuest !== false && input.source !== "WALK_IN") {
          emailIds.push(await enqueueEmail(tx, { ...ref, type: "RESERVATION_CONFIRMED" }));
        }

        await tx.auditLog.create({
          data: {
            restaurantId: input.restaurantId,
            userId: input.createdById ?? null,
            action: "reservation.created",
            entityId: reservation.id,
            meta: { source: input.source, status, tables: resolution.candidate.tableIds },
          },
        });

        const tableNames = config.tables.filter((t) => resolution.candidate.tableIds.includes(t.id)).map((t) => t.name);

        return {
          id: reservation.id,
          code: reservation.code,
          status,
          startsAt: resolution.start,
          endsAt: resolution.end,
          tableNames,
          areaId: resolution.candidate.areaId,
          emailIds,
        };
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
  } catch (error) {
    // Letzte Verteidigungslinie: DB-Constraint hat eine Überschneidung verhindert.
    if (isOverlapViolation(error)) throw new ReservationError("TABLE_TAKEN");
    throw error;
  }
}

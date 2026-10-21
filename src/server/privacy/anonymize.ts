import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { hashToken } from "../crypto";

/** Felder, die beim Anonymisieren geleert werden. Personenzahl, Zeit, Status bleiben für Statistiken. */
const ANONYMIZED: Prisma.ReservationUpdateManyMutationInput = {
  guestName: null,
  guestEmail: null,
  guestPhone: null,
  guestNotes: null,
  internalNotes: null,
  cancelReason: null,
  manageTokenHash: null,
};

/**
 * Cron-Job: Gastdaten `anonymizeAfterDays` Tage nach dem Reservierungsdatum
 * anonymisieren (Standard 180). Idempotent.
 */
export async function runAnonymization(now = new Date()): Promise<{ anonymized: number }> {
  const settings = await db.restaurantSettings.findMany({ select: { restaurantId: true, anonymizeAfterDays: true } });
  let anonymized = 0;
  for (const s of settings) {
    const cutoff = new Date(now.getTime() - Math.min(180, s.anonymizeAfterDays) * 86_400_000);
    const result = await db.reservation.updateMany({
      where: { restaurantId: s.restaurantId, anonymizedAt: null, startsAt: { lt: cutoff } },
      data: { ...ANONYMIZED, anonymizedAt: now },
    });
    anonymized += result.count;
  }
  return { anonymized };
}

/** Alle Reservierungen eines Gastes (per E-Mail) in einem Restaurant. */
export function findGuestReservations(restaurantId: string, email: string) {
  return db.reservation.findMany({
    where: { restaurantId, guestEmail: email.trim().toLowerCase() },
    orderBy: { startsAt: "desc" },
    include: { tables: { include: { table: { select: { name: true } } } } },
  });
}

/** Auskunft nach Art. 15 / Datenübertragbarkeit nach Art. 20 DSGVO (JSON). */
export async function exportGuestData(restaurantId: string, email: string, handledById: string) {
  const rows = await findGuestReservations(restaurantId, email);
  await db.privacyRequest.create({
    data: { restaurantId, type: "EXPORT", emailHash: hashToken(email.trim().toLowerCase()), affectedCount: rows.length, handledById },
  });
  return {
    exportedAt: new Date().toISOString(),
    email: email.trim().toLowerCase(),
    reservations: rows.map((r) => ({
      code: r.code,
      status: r.status,
      source: r.source,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      partySize: r.partySize,
      tables: r.tables.filter((t) => t.active).map((t) => t.table.name),
      name: r.guestName,
      email: r.guestEmail,
      phone: r.guestPhone,
      notes: r.guestNotes,
      language: r.locale,
      privacyNoticeAcknowledgedAt: r.privacyConsentAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** Löschung nach Art. 17 DSGVO: sofort anonymisieren (Statistik bleibt anonym erhalten). */
export async function eraseGuestData(restaurantId: string, email: string, handledById: string, now = new Date()) {
  const normalized = email.trim().toLowerCase();
  return db.$transaction(async (tx) => {
    const result = await tx.reservation.updateMany({
      where: { restaurantId, guestEmail: normalized },
      data: { ...ANONYMIZED, anonymizedAt: now },
    });
    await tx.privacyRequest.create({
      data: { restaurantId, type: "DELETE", emailHash: hashToken(normalized), affectedCount: result.count, handledById },
    });
    return result.count;
  });
}

import "server-only";
import { db } from "../db";
import { dispatchEmails, enqueueEmail } from "./outbox";

/** Größte einstellbare Vorlaufzeit; begrenzt die Kandidatenabfrage. */
export const REMINDER_HOURS_OPTIONS = [2, 4, 12, 24, 48] as const;
const MAX_HOURS = Math.max(...REMINDER_HOURS_OPTIONS);
const HOUR = 3_600_000;

/**
 * Cron: Erinnerungs-Mails vor dem Besuch.
 *
 * Erinnert werden bestätigte Online- und Telefonbuchungen mit E-Mail-Adresse,
 * sobald der Besuch innerhalb der eingestellten Vorlaufzeit liegt. Wer erst
 * innerhalb dieses Fensters gebucht hat, bekommt keine Erinnerung – die
 * Bestätigung ist dann gerade erst angekommen.
 *
 * `reminderSentAt` wird atomar gesetzt (zusammen mit dem Outbox-Eintrag), damit
 * parallele Läufe nicht doppelt erinnern. Eine Änderung der Reservierung setzt
 * das Feld zurück (siehe reservations/manage.ts) – dann wird erneut erinnert.
 */
export async function sendReminders(now = new Date(), limit = 200): Promise<{ queued: number; sent: number }> {
  const candidates = await db.reservation.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      anonymizedAt: null,
      guestEmail: { not: null },
      startsAt: { gt: now, lte: new Date(now.getTime() + MAX_HOURS * HOUR) },
      restaurant: { status: "ACTIVE", settings: { reminderEnabled: true } },
    },
    select: {
      id: true,
      restaurantId: true,
      startsAt: true,
      createdAt: true,
      restaurant: { select: { settings: { select: { reminderHoursBefore: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: limit,
  });

  const due = candidates.filter((r) => {
    const hours = r.restaurant.settings?.reminderHoursBefore ?? 24;
    const windowStart = r.startsAt.getTime() - hours * HOUR;
    return now.getTime() >= windowStart && r.createdAt.getTime() < windowStart;
  });

  const ids: string[] = [];
  for (const r of due) {
    const id = await db.$transaction(async (tx) => {
      const claimed = await tx.reservation.updateMany({
        where: { id: r.id, status: "CONFIRMED", reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      return claimed.count === 1 ? enqueueEmail(tx, { restaurantId: r.restaurantId, reservationId: r.id, type: "RESERVATION_REMINDER" }) : null;
    });
    if (id) ids.push(id);
  }
  await dispatchEmails(ids); // Fehlschläge holt der Job send-emails nach
  const sent = ids.length ? await db.emailLog.count({ where: { id: { in: ids }, status: "SENT", providerMessageId: { not: "skipped" } } }) : 0;
  return { queued: ids.length, sent };
}

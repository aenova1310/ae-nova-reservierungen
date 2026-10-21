import "server-only";
import { db } from "../db";
import { retryPendingEmails } from "../email/outbox";
import { sendReminders } from "../email/reminders";
import { runAnonymization } from "../privacy/anonymize";
import { expireStaleHolds, lockRestaurant } from "../reservations/create";

/**
 * Hintergrundjobs. Werden per HTTP von einem externen Scheduler aufgerufen
 * (siehe README, Abschnitt „Cron-Jobs“). Alle Jobs sind idempotent.
 */
export const JOBS = {
  /** Jede Minute: unbezahlte Anzahlungs-Holds verfallen lassen (Phase 2: zusätzlich Checkout beenden). */
  "expire-holds": async () => {
    const restaurants = await db.reservation.findMany({
      where: { status: "PENDING_PAYMENT", holdExpiresAt: { lt: new Date() } },
      distinct: ["restaurantId"],
      select: { restaurantId: true },
    });
    let expired = 0;
    for (const { restaurantId } of restaurants) {
      expired += await db.$transaction(async (tx) => {
        await lockRestaurant(tx, restaurantId);
        return expireStaleHolds(tx, restaurantId, new Date());
      });
    }
    return { expired };
  },
  /** Alle 5 Minuten: wartende/fehlgeschlagene E-Mails erneut senden. */
  "send-emails": () => retryPendingEmails(),
  /** Alle 15 Minuten: Erinnerungs-Mails vor dem Besuch. */
  "send-reminders": () => sendReminders(),
  /** Täglich: Gastdaten nach Ablauf der Frist anonymisieren. */
  anonymize: () => runAnonymization(),
  /** Täglich: abgelaufene Sessions, Reset-Links und alte (auch angenommene) Einladungen löschen. */
  cleanup: async () => {
    const now = new Date();
    const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    const resets = await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });
    // Abgelaufene Einladungen 30 Tage lang im Team-Bereich zeigen (erneut senden), dann löschen
    // Angenommene Einladungen ebenfalls nach 30 Tagen (Datensparsamkeit: enthalten E-Mail-Adressen)
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
    const invitations = await db.invitation.deleteMany({
      where: { OR: [{ acceptedAt: null, expiresAt: { lt: monthAgo } }, { acceptedAt: { lt: monthAgo } }] },
    });
    return { sessions: sessions.count, resets: resets.count, invitations: invitations.count };
  },
} as const;

export type JobName = keyof typeof JOBS;

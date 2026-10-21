import "server-only";
import { db } from "../db";
import { retryPendingEmails } from "../email/outbox";
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
  /** Täglich: Gastdaten nach Ablauf der Frist anonymisieren. */
  anonymize: () => runAnonymization(),
  /** Täglich: abgelaufene Sessions und Reset-Tokens löschen. */
  cleanup: async () => {
    const now = new Date();
    const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    const resets = await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });
    return { sessions: sessions.count, resets: resets.count };
  },
} as const;

export type JobName = keyof typeof JOBS;

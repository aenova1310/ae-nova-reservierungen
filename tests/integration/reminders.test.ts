import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { retryPendingEmails } from "@/server/email/outbox";
import { setEmailProvider, type EmailMessage } from "@/server/email/provider";
import { sendReminders } from "@/server/email/reminders";
import { createReservation } from "@/server/reservations/create";
import { createRestaurant, DATE, guest, NOW, resetDatabase } from "../support/factory";

const sent: EmailMessage[] = [];
let failNext = 0;
setEmailProvider({
  async send(message) {
    if (failNext > 0) {
      failNext--;
      throw new Error("Provider nicht erreichbar");
    }
    sent.push(message);
    return { id: `ok-${sent.length}` };
  },
});

beforeEach(async () => {
  sent.length = 0;
  failNext = 0;
  await resetDatabase();
});
afterAll(() => db.$disconnect());

/** Buchung am 03.11.2026 um 19:00 Berlin (= 18:00 UTC), angelegt am 01.11. */
async function book(restaurantId: string, n = 1, createdAt = NOW) {
  const r = await createReservation({
    restaurantId,
    date: DATE,
    time: "19:00",
    partySize: 2,
    channel: "ONLINE",
    source: "ONLINE",
    guest: guest(n),
    privacyAcknowledged: true,
    now: NOW,
  });
  await db.reservation.update({ where: { id: r.id }, data: { createdAt } });
  sent.length = 0; // Bestätigungsmail nicht mitzählen
  return r;
}

const at = (iso: string) => new Date(iso);

describe("Erinnerungs-Mails", () => {
  it("erinnert einmal, 24 h vorher, mit Verwaltungslink und ohne zweiten Kalenderanhang", async () => {
    const { restaurant } = await createRestaurant("erinnerung");
    const r = await book(restaurant.id);

    expect(await sendReminders(at("2026-11-02T17:00:00Z"))).toEqual({ queued: 0, sent: 0 }); // 25 h vorher
    expect(await sendReminders(at("2026-11-02T18:30:00Z"))).toEqual({ queued: 1, sent: 1 }); // 23,5 h vorher
    expect(await sendReminders(at("2026-11-02T19:00:00Z"))).toEqual({ queued: 0, sent: 0 }); // schon erinnert

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("gast1@example.test");
    expect(sent[0].subject).toMatch(/^Erinnerung: Ihre Reservierung bei Restaurant erinnerung/);
    expect(sent[0].html).toContain("/m/");
    expect(sent[0].attachments ?? []).toHaveLength(0);
    expect((await db.reservation.findUniqueOrThrow({ where: { id: r.id } })).reminderSentAt).not.toBeNull();
  });

  it("erinnert nicht, wenn erst innerhalb der Vorlaufzeit gebucht wurde", async () => {
    const { restaurant } = await createRestaurant("kurzfristig");
    await book(restaurant.id, 1, at("2026-11-03T08:00:00Z"));
    expect((await sendReminders(at("2026-11-03T12:00:00Z"))).queued).toBe(0);
  });

  it("beachtet Einstellung und Vorlaufzeit je Restaurant", async () => {
    const off = await createRestaurant("aus");
    await db.restaurantSettings.update({ where: { restaurantId: off.restaurant.id }, data: { reminderEnabled: false } });
    await book(off.restaurant.id, 1);

    const short = await createRestaurant("kurz");
    await db.restaurantSettings.update({ where: { restaurantId: short.restaurant.id }, data: { reminderHoursBefore: 2 } });
    await book(short.restaurant.id, 2);

    expect((await sendReminders(at("2026-11-02T20:00:00Z"))).queued).toBe(0); // 22 h vorher: keiner
    expect((await sendReminders(at("2026-11-03T16:30:00Z"))).queued).toBe(1); // 1,5 h vorher: nur "kurz"
    expect(sent.map((m) => m.to)).toEqual(["gast2@example.test"]);
  });

  it("erinnert nur bestätigte Reservierungen, auch bei verzögertem Versand", async () => {
    const { restaurant } = await createRestaurant("storno", [
      { name: "T1", min: 1, max: 2 },
      { name: "T2", min: 1, max: 2 },
    ]);
    const cancelled = await book(restaurant.id, 1);
    await db.reservation.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    expect((await sendReminders(at("2026-11-02T19:00:00Z"))).queued).toBe(0);

    // Versand schlägt fehl, dann storniert der Gast – der Nachversand darf nicht erinnern
    const late = await book(restaurant.id, 2);
    failNext = 1;
    expect(await sendReminders(at("2026-11-02T19:00:00Z"))).toEqual({ queued: 1, sent: 0 });
    await db.reservation.update({ where: { id: late.id }, data: { status: "CANCELLED" } });
    await retryPendingEmails(); // sendet auch die noch wartenden Bestätigungen
    expect(sent.filter((m) => m.subject.startsWith("Erinnerung"))).toHaveLength(0);
    const log = await db.emailLog.findFirstOrThrow({ where: { type: "RESERVATION_REMINDER" } });
    expect(log).toMatchObject({ providerMessageId: "skipped", error: "nicht mehr bestätigt" });
  });

  it("ignoriert gesperrte Restaurants", async () => {
    const { restaurant } = await createRestaurant("gesperrt");
    await book(restaurant.id);
    await db.restaurant.update({ where: { id: restaurant.id }, data: { status: "SUSPENDED" } });
    expect((await sendReminders(at("2026-11-02T19:00:00Z"))).queued).toBe(0);
  });
});

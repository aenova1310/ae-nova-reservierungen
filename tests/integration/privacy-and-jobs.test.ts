import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { setEmailProvider, type EmailMessage } from "@/server/email/provider";
import { retryPendingEmails } from "@/server/email/outbox";
import { eraseGuestData, exportGuestData, runAnonymization } from "@/server/privacy/anonymize";
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

const book = (restaurantId: string, n = 1) =>
  createReservation({
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

describe("Anonymisierung nach Frist", () => {
  it("anonymisiert erst nach 180 Tagen und lässt Statistikfelder stehen", async () => {
    const { restaurant } = await createRestaurant("anon");
    const r = await book(restaurant.id);

    expect((await runAnonymization(new Date("2027-04-30T00:00:00Z"))).anonymized).toBe(0); // < 180 Tage
    expect((await runAnonymization(new Date("2027-05-03T00:00:00Z"))).anonymized).toBe(1); // > 180 Tage

    const after = await db.reservation.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.guestName).toBeNull();
    expect(after.guestEmail).toBeNull();
    expect(after.guestPhone).toBeNull();
    expect(after.manageTokenHash).toBeNull();
    expect(after.anonymizedAt).not.toBeNull();
    // Für Kennzahlen bleibt erhalten:
    expect(after.partySize).toBe(2);
    expect(after.status).toBe("CONFIRMED");
    // idempotent
    expect((await runAnonymization(new Date("2027-06-01T00:00:00Z"))).anonymized).toBe(0);
  });

  it("respektiert kürzere Fristen pro Restaurant", async () => {
    const { restaurant } = await createRestaurant("kurz");
    await db.restaurantSettings.update({ where: { restaurantId: restaurant.id }, data: { anonymizeAfterDays: 30 } });
    await book(restaurant.id);
    expect((await runAnonymization(new Date("2026-12-04T00:00:00Z"))).anonymized).toBe(1);
  });
});

describe("Betroffenenrechte", () => {
  it("exportiert und löscht Daten eines Gastes – nur im eigenen Restaurant", async () => {
    const a = await createRestaurant("dsgvo-a");
    const b = await createRestaurant("dsgvo-b");
    await book(a.restaurant.id);
    await book(b.restaurant.id);
    const user = await db.user.create({ data: { email: "o@test", passwordHash: "x" } });

    const exported = await exportGuestData(a.restaurant.id, "GAST1@example.test", user.id);
    expect(exported.reservations).toHaveLength(1);
    expect(exported.reservations[0].email).toBe("gast1@example.test");

    expect(await eraseGuestData(a.restaurant.id, "gast1@example.test", user.id)).toBe(1);
    expect(await db.reservation.count({ where: { guestEmail: "gast1@example.test" } })).toBe(1); // Restaurant B unberührt

    const log = await db.privacyRequest.findMany({ where: { restaurantId: a.restaurant.id } });
    expect(log.map((l) => l.type).sort()).toEqual(["DELETE", "EXPORT"]);
    expect(JSON.stringify(log)).not.toContain("gast1@example.test");
  });
});

describe("E-Mail-Outbox", () => {
  it("holt fehlgeschlagene Mails beim nächsten Lauf nach und sendet nie doppelt", async () => {
    const { restaurant } = await createRestaurant("outbox");
    failNext = 1;
    const r = await book(restaurant.id);
    const first = await retryPendingEmails();
    expect(first).toEqual({ sent: 1, failed: 1 });
    const second = await retryPendingEmails();
    expect(second).toEqual({ sent: 1, failed: 0 });
    expect(await retryPendingEmails()).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(2);
    const logs = await db.emailLog.findMany({ where: { reservationId: r.id } });
    expect(logs.every((l) => l.status === "SENT")).toBe(true);
  });
});

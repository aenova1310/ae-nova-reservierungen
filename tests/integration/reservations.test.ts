import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { setEmailProvider, type EmailMessage } from "@/server/email/provider";
import { dispatchEmails } from "@/server/email/outbox";
import { createReservation } from "@/server/reservations/create";
import { isOverlapViolation, ReservationError } from "@/server/reservations/errors";
import { cancelReservation, findReservationByToken, modifyReservation } from "@/server/reservations/manage";
import { changeReservationStatus } from "@/server/reservations/status";
import { manageTokenFor } from "@/server/reservations/tokens";
import { tenantDb } from "@/server/tenancy/tenant-db";
import { createRestaurant, DATE, guest, NOW, resetDatabase } from "../support/factory";

const sent: EmailMessage[] = [];
setEmailProvider({
  async send(message) {
    sent.push(message);
    return { id: `test-${sent.length}` };
  },
});

beforeEach(async () => {
  sent.length = 0;
  await resetDatabase();
});

afterAll(async () => {
  await db.$disconnect();
});

const online = (restaurantId: string, overrides: Partial<Parameters<typeof createReservation>[0]> = {}) =>
  createReservation({
    restaurantId,
    date: DATE,
    time: "19:00",
    partySize: 2,
    channel: "ONLINE",
    source: "ONLINE",
    guest: guest(),
    privacyAcknowledged: true,
    now: NOW,
    ...overrides,
  });

describe("Doppelbuchungsschutz", () => {
  it("lässt bei 12 gleichzeitigen Buchungen auf den letzten Tisch genau eine durch", async () => {
    const { restaurant } = await createRestaurant("parallel");
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => online(restaurant.id, { guest: guest(i) })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(11);
    for (const f of failed) {
      expect(f.reason).toBeInstanceOf(ReservationError);
      expect(["NO_TABLE", "TABLE_TAKEN"]).toContain((f.reason as ReservationError).code);
    }
    expect(await db.reservationTable.count({ where: { active: true } })).toBe(1);
  });

  it("der DB-Constraint verhindert Überschneidungen auch ohne Anwendungslogik", async () => {
    const { restaurant, tables } = await createRestaurant("constraint");
    const a = await online(restaurant.id);
    const r = await db.reservation.findUniqueOrThrow({ where: { id: a.id } });
    const second = await db.reservation.create({
      data: { ...r, id: undefined, code: "ZZZZZZ", manageTokenHash: null, startsAt: r.startsAt, endsAt: r.endsAt },
    });
    let error: unknown;
    try {
      await db.reservationTable.create({
        data: {
          restaurantId: restaurant.id,
          reservationId: second.id,
          tableId: tables[0].id,
          startsAt: new Date(r.startsAt.getTime() + 30 * 60_000),
          blockedUntil: new Date(r.endsAt.getTime() + 30 * 60_000),
        },
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(isOverlapViolation(error)).toBe(true);
  });

  it("erlaubt eine Buchung direkt im Anschluss (19:00–20:30, dann 20:30)", async () => {
    const { restaurant } = await createRestaurant("anschluss");
    await online(restaurant.id, { time: "19:00" });
    await expect(online(restaurant.id, { time: "20:00" })).rejects.toMatchObject({ code: "NO_TABLE" });
    const next = await online(restaurant.id, { time: "20:30", guest: guest(2) });
    expect(next.status).toBe("CONFIRMED");
  });
});

describe("Anlegen", () => {
  it("bestätigt automatisch, versendet Gast- und Restaurant-Mail mit .ics und Verwaltungslink", async () => {
    const { restaurant } = await createRestaurant("mails");
    const created = await online(restaurant.id);
    expect(created.status).toBe("CONFIRMED");
    expect(created.tableNames).toEqual(["T1"]);
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);

    await dispatchEmails(created.emailIds);
    expect(sent).toHaveLength(2);
    const guestMail = sent.find((m) => m.to === "gast1@example.test")!;
    expect(guestMail.subject).toContain("Ihre Reservierung bei Restaurant mails");
    expect(guestMail.attachments?.[0].content).toContain("BEGIN:VEVENT");
    expect(guestMail.attachments?.[0].content).toContain("DTSTART:20261103T180000Z");

    // Link aus der Mail führt zur Reservierung
    const token = manageTokenFor(created.id, 1);
    expect(guestMail.html).toContain(`/r/mails/m/${token}`);
    const found = await findReservationByToken(token);
    expect(found?.id).toBe(created.id);

    const restaurantMail = sent.find((m) => m.to === "mails@restaurant.test")!;
    expect(restaurantMail.subject).toContain("Neue Online-Reservierung");
  });

  it("legt bei manueller Freigabe eine Anfrage an; Bestätigung im Admin schickt die Mail", async () => {
    const { restaurant } = await createRestaurant("manuell", undefined, { confirmationMode: "MANUAL" });
    const created = await online(restaurant.id);
    expect(created.status).toBe("REQUESTED");
    await dispatchEmails(created.emailIds);
    expect(sent.map((m) => m.subject)).toEqual(
      expect.arrayContaining([expect.stringContaining("Ihre Anfrage"), expect.stringContaining("bitte bestätigen")]),
    );

    // Anfrage blockiert den Tisch bereits
    await expect(online(restaurant.id, { guest: guest(2) })).rejects.toMatchObject({ code: "NO_TABLE" });

    const user = await db.user.create({ data: { email: "owner@test", passwordHash: "x" } });
    sent.length = 0;
    const { emailIds } = await changeReservationStatus({
      restaurantId: restaurant.id,
      reservationId: created.id,
      to: "CONFIRMED",
      userId: user.id,
    });
    await dispatchEmails(emailIds);
    expect(sent[0].subject).toContain("Ihre Reservierung");
  });

  it("verlangt online die Kenntnisnahme der Datenschutzhinweise", async () => {
    const { restaurant } = await createRestaurant("consent");
    await expect(online(restaurant.id, { privacyAcknowledged: false })).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
  });

  it("erfasst Walk-ins als eingetroffen und ohne Mail", async () => {
    const { restaurant } = await createRestaurant("walkin");
    const created = await createReservation({
      restaurantId: restaurant.id,
      date: DATE,
      time: "19:07",
      partySize: 2,
      channel: "STAFF",
      source: "WALK_IN",
      guest: { name: "Laufkundschaft" },
      now: NOW,
    });
    expect(created.status).toBe("ARRIVED");
    expect(created.emailIds).toEqual([]);
  });

  it("lehnt Buchungen bei gesperrtem Restaurant ab", async () => {
    const { restaurant } = await createRestaurant("gesperrt");
    await db.restaurant.update({ where: { id: restaurant.id }, data: { status: "SUSPENDED" } });
    await expect(online(restaurant.id)).rejects.toMatchObject({ code: "RESTAURANT_SUSPENDED" });
  });
});

describe("Stornieren und Ändern über den Link", () => {
  it("Storno durch den Gast gibt den Tisch sofort frei und informiert beide Seiten", async () => {
    const { restaurant } = await createRestaurant("storno");
    const created = await online(restaurant.id);
    await expect(online(restaurant.id, { guest: guest(2) })).rejects.toMatchObject({ code: "NO_TABLE" });

    const { emailIds } = await cancelReservation({
      reservationId: created.id,
      restaurantId: restaurant.id,
      by: "GUEST",
      now: NOW,
    });
    await dispatchEmails(emailIds);
    expect(sent.map((m) => m.to).sort()).toEqual(["gast1@example.test", "storno@restaurant.test"]);
    const ics = sent.find((m) => m.to === "gast1@example.test")!.attachments![0].content;
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("SEQUENCE:1");

    const again = await online(restaurant.id, { guest: guest(2) });
    expect(again.status).toBe("CONFIRMED");
  });

  it("Storno durch den Gast ist nach Reservierungsbeginn nicht mehr möglich", async () => {
    const { restaurant } = await createRestaurant("zuspaet");
    const created = await online(restaurant.id);
    await expect(
      cancelReservation({
        reservationId: created.id,
        restaurantId: restaurant.id,
        by: "GUEST",
        now: new Date("2026-11-03T18:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "NOT_CANCELLABLE" });
  });

  it("Umbuchung belegt den neuen Slot und gibt den alten frei", async () => {
    const { restaurant } = await createRestaurant("umbuchen");
    const created = await online(restaurant.id, { time: "19:00" });
    const moved = await modifyReservation({
      reservationId: created.id,
      restaurantId: restaurant.id,
      date: DATE,
      time: "12:00",
      partySize: 2,
      by: "GUEST",
      now: NOW,
    });
    expect(moved.startsAt.toISOString()).toBe("2026-11-03T11:00:00.000Z");
    // 19:00 ist wieder frei
    const other = await online(restaurant.id, { time: "19:00", guest: guest(2) });
    expect(other.status).toBe("CONFIRMED");
    // Umbuchung auf belegten Slot schlägt fehl und lässt die Reservierung unverändert
    await expect(
      modifyReservation({
        reservationId: created.id,
        restaurantId: restaurant.id,
        date: DATE,
        time: "19:00",
        partySize: 2,
        by: "GUEST",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "NO_TABLE" });
    const unchanged = await db.reservation.findUniqueOrThrow({ where: { id: created.id } });
    expect(unchanged.startsAt.toISOString()).toBe("2026-11-03T11:00:00.000Z");
    expect(unchanged.icsSequence).toBe(1);
  });
});

describe("Mandantentrennung", () => {
  it("tenantDb sieht und verändert nur Daten des eigenen Restaurants", async () => {
    const a = await createRestaurant("mandant-a");
    const b = await createRestaurant("mandant-b");
    const resA = await online(a.restaurant.id);
    const resB = await online(b.restaurant.id);

    const tdbA = tenantDb(a.restaurant.id);
    const list = await tdbA.reservation.findMany();
    expect(list.map((r) => r.id)).toEqual([resA.id]);
    expect(await tdbA.reservation.findUnique({ where: { id: resB.id } })).toBeNull();
    expect(await tdbA.reservation.count()).toBe(1);
    await expect(tdbA.reservation.update({ where: { id: resB.id }, data: { internalNotes: "x" } })).rejects.toThrow();
    const deleted = await tdbA.reservation.deleteMany({ where: { id: resB.id } });
    expect(deleted.count).toBe(0);

    // create setzt restaurantId zwingend auf den eigenen Mandanten
    const area = await tdbA.area.create({ data: { name: "Neu", restaurantId: b.restaurant.id } });
    expect(area.restaurantId).toBe(a.restaurant.id);
  });
});

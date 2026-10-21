import { describe, expect, it } from "vitest";
import { computeDayAvailability, resolveBooking } from "@/server/availability";
import { onlineQuotaLimit, onlineSeatCapacity, peakConcurrentGuests } from "@/server/availability/quota";
import { areas, at, load, makeContext, TABLES_ALL, TUESDAY } from "./fixtures";

const day = (ctx = makeContext(), partySize = 2, date = TUESDAY, channel: "ONLINE" | "STAFF" = "ONLINE") =>
  computeDayAvailability(ctx, { date, partySize, channel });

describe("Buchungsregeln", () => {
  it("respektiert die Vorlaufzeit am selben Tag", () => {
    // Jetzt: Dienstag 17:05 Berlin, Vorlauf 60 min → erster Slot 18:15
    const ctx = makeContext({ now: at("17:05") });
    const slots = day(ctx).slots;
    expect(slots[0].time).toBe("18:15");
    // Personal sieht auch frühere Slots
    expect(day(ctx, 2, TUESDAY, "STAFF").slots[0].time).toBe("17:30");
  });

  it("lehnt Online-Buchungen zu kurz vor Beginn ab", () => {
    const ctx = makeContext({ now: at("17:30") });
    expect(resolveBooking(ctx, { date: TUESDAY, start: at("18:00"), partySize: 2, channel: "ONLINE" })).toEqual({
      ok: false,
      code: "TOO_SOON",
    });
  });

  it("begrenzt die maximale Vorausbuchung", () => {
    const ctx = makeContext({ rules: { maxAdvanceDays: 1 } });
    expect(day(ctx).closedReason).toBe("OUT_OF_RANGE");
    expect(day(ctx, 2, "2026-11-02").closedReason).toBe("RUHETAG");
  });

  it("lässt vergangene Tage online nicht zu", () => {
    expect(day(makeContext(), 2, "2026-10-31").closedReason).toBe("OUT_OF_RANGE");
  });

  it("begrenzt die Gruppengröße online, Personal darf größere Gruppen erfassen", () => {
    expect(day(makeContext(), 9).closedReason).toBe("PARTY_SIZE");
    expect(day(makeContext(), 9, TUESDAY, "STAFF").closed).toBe(false);
    expect(day(makeContext(), 0, TUESDAY, "STAFF").closedReason).toBe("PARTY_SIZE");
  });

  it("liefert für Ruhetag und Sonderschließung keinen Slot", () => {
    expect(day(makeContext(), 2, "2026-11-02").closedReason).toBe("RUHETAG");
    const closed = makeContext({
      exceptions: [{ date: TUESDAY, type: "CLOSED", startTime: null, endTime: null, lastSeatingTime: null }],
    });
    expect(day(closed).closedReason).toBe("CLOSED");
  });
});

describe("Online-Kontingent", () => {
  it("summiert nur online buchbare, aktive Plätze", () => {
    expect(onlineSeatCapacity(TABLES_ALL, areas)).toBe(2 + 2 + 4 + 4 + 6 + 2 + 4);
    const noOnline = TABLES_ALL.map((t) => (t.id === "T5" ? { ...t, onlineBookable: false } : t));
    expect(onlineSeatCapacity(noOnline, areas)).toBe(18);
    expect(onlineQuotaLimit(24, 50)).toBe(12);
    expect(onlineQuotaLimit(25, 50)).toBe(12);
  });

  it("berechnet die Spitzenlast gleichzeitiger Gäste", () => {
    const loads = [load("18:00", "20:00", 4), load("19:00", "21:00", 6), load("20:00", "22:00", 2)];
    expect(peakConcurrentGuests(loads, at("17:00"), at("23:00"))).toBe(10);
    // Ende und Beginn am selben Zeitpunkt addieren sich nicht
    expect(peakConcurrentGuests(loads, at("20:00"), at("21:00"))).toBe(8);
    expect(peakConcurrentGuests(loads, at("21:00"), at("23:00"))).toBe(2);
  });

  it("sperrt Slots, wenn das Online-Kontingent erschöpft ist", () => {
    // 24 Plätze × 50 % = 12 online gleichzeitig
    const ctx = makeContext({
      rules: { onlineQuotaPercent: 50 },
      onlineLoads: [load("18:00", "20:00", 6), load("18:00", "20:00", 4)],
    });
    const at1800 = day(ctx, 4).slots.find((s) => s.time === "18:00")!;
    expect(at1800.available).toBe(false);
    expect(at1800.reason).toBe("QUOTA");
    expect(day(ctx, 2).slots.find((s) => s.time === "18:00")!.available).toBe(true);
    // ab 20:00 ist das Kontingent wieder frei
    expect(day(ctx, 4).slots.find((s) => s.time === "20:00")!.available).toBe(true);
    // Personal ist nicht an das Kontingent gebunden
    expect(resolveBooking(ctx, { date: TUESDAY, start: at("18:00"), partySize: 4, channel: "STAFF" }).ok).toBe(true);
    expect(resolveBooking(ctx, { date: TUESDAY, start: at("18:00"), partySize: 4, channel: "ONLINE" })).toEqual({
      ok: false,
      code: "QUOTA",
    });
  });

  it("0 % Kontingent schließt Online-Buchungen komplett", () => {
    const ctx = makeContext({ rules: { onlineQuotaPercent: 0 } });
    expect(day(ctx).slots.every((s) => !s.available && s.reason === "QUOTA")).toBe(true);
  });
});

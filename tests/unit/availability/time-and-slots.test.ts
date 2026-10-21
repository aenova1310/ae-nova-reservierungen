import { describe, expect, it } from "vitest";
import { durationFor, openingWindowsFor, slotTimesFor } from "@/server/availability/slots";
import {
  addDaysToDate,
  daysBetween,
  isLocalDate,
  isoWeekday,
  localToUtc,
  overlaps,
  utcToLocalDate,
  utcToLocalTime,
} from "@/server/availability/time";
import type { ShiftDef } from "@/server/availability";
import { defaultRules, shifts, TUESDAY } from "./fixtures";

const BERLIN = "Europe/Berlin";

describe("Zeit-Hilfsfunktionen", () => {
  it("rechnet Winter- und Sommerzeit korrekt in UTC um", () => {
    expect(localToUtc("2026-11-03", 18 * 60, BERLIN)?.toISOString()).toBe("2026-11-03T17:00:00.000Z");
    expect(localToUtc("2026-07-03", 18 * 60, BERLIN)?.toISOString()).toBe("2026-07-03T16:00:00.000Z");
  });

  it("liefert null für Uhrzeiten, die es wegen der Zeitumstellung nicht gibt", () => {
    // 29.03.2026: 02:00 → 03:00
    expect(localToUtc("2026-03-29", 2 * 60 + 30, BERLIN)).toBeNull();
    expect(localToUtc("2026-03-29", 3 * 60, BERLIN)?.toISOString()).toBe("2026-03-29T01:00:00.000Z");
  });

  it("nimmt bei doppelt vorkommender Uhrzeit (Herbst) die spätere", () => {
    // 25.10.2026: 03:00 → 02:00, 02:30 existiert zweimal
    expect(localToUtc("2026-10-25", 2 * 60 + 30, BERLIN)?.toISOString()).toBe("2026-10-25T01:30:00.000Z");
  });

  it("rechnet Minuten über Mitternacht in den Folgetag", () => {
    expect(localToUtc("2026-11-03", 25 * 60, BERLIN)?.toISOString()).toBe("2026-11-04T00:00:00.000Z");
  });

  it("bestimmt Wochentag, Tagesdifferenzen und lokale Darstellung", () => {
    expect(isoWeekday("2026-11-02")).toBe(1); // Montag
    expect(isoWeekday("2026-11-08")).toBe(7); // Sonntag
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-11-01", "2027-01-30")).toBe(90);
    expect(utcToLocalDate(new Date("2026-11-01T23:30:00Z"), BERLIN)).toBe("2026-11-02");
    expect(utcToLocalTime(new Date("2026-11-01T23:30:00Z"), BERLIN)).toBe("00:30");
  });

  it("validiert Datumsangaben streng", () => {
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-1-1")).toBe(false);
  });

  it("behandelt Intervalle halboffen (Ende = Beginn überlappt nicht)", () => {
    const a = new Date("2026-11-03T17:00:00Z");
    const b = new Date("2026-11-03T19:00:00Z");
    const c = new Date("2026-11-03T21:00:00Z");
    expect(overlaps(a, b, b, c)).toBe(false);
    expect(overlaps(a, c, b, c)).toBe(true);
  });
});

describe("Verweildauer", () => {
  it("wählt die Regel passend zur Personenzahl", () => {
    expect(durationFor(2, defaultRules)).toBe(90);
    expect(durationFor(4, defaultRules)).toBe(120);
    expect(durationFor(7, defaultRules)).toBe(150);
  });

  it("fällt ohne passende Regel auf den Standard zurück", () => {
    expect(durationFor(30, defaultRules)).toBe(120);
    expect(durationFor(3, { durationRules: [], defaultDurationMinutes: 105 })).toBe(105);
  });
});

describe("Öffnungsfenster", () => {
  it("erkennt Ruhetage (Wochentag ohne Schicht)", () => {
    const r = openingWindowsFor("2026-11-02", shifts, [], 15);
    expect(r.closedBy).toBe("RUHETAG");
  });

  it("Sonderschließung hat Vorrang vor Schichten", () => {
    const r = openingWindowsFor(
      TUESDAY,
      shifts,
      [{ date: TUESDAY, type: "CLOSED", startTime: null, endTime: null, lastSeatingTime: null }],
      15,
    );
    expect(r.closedBy).toBe("CLOSED");
    expect(r.windows).toHaveLength(0);
  });

  it("Sonderöffnungszeiten ersetzen die regulären Schichten – auch an Ruhetagen", () => {
    const r = openingWindowsFor(
      "2026-11-02",
      shifts,
      [{ date: "2026-11-02", type: "SPECIAL_HOURS", startTime: "18:00", endTime: "23:00", lastSeatingTime: "21:00" }],
      15,
    );
    expect(r.closedBy).toBeNull();
    expect(r.windows).toHaveLength(1);
    expect(r.windows[0].startMin).toBe(18 * 60);
  });

  it("berücksichtigt Saisonzeiten (validFrom/validUntil)", () => {
    const terrace: ShiftDef = {
      id: "s",
      name: "Sommer",
      weekday: 1,
      startTime: "12:00",
      endTime: "22:00",
      lastSeatingTime: null,
      slotIntervalMinutes: null,
      validFrom: "2026-05-01",
      validUntil: "2026-09-30",
    };
    expect(openingWindowsFor("2026-06-01", [terrace], [], 15).windows).toHaveLength(1);
    expect(openingWindowsFor("2026-11-02", [terrace], [], 15).closedBy).toBe("RUHETAG");
  });
});

describe("Slot-Zeitpunkte", () => {
  it("erzeugt Slots von Schichtbeginn bis zum letzten Einlass", () => {
    const { windows } = openingWindowsFor(TUESDAY, shifts, [], 15);
    const slots = slotTimesFor(TUESDAY, windows, 90, BERLIN);
    expect(slots[0].time).toBe("17:30");
    expect(slots.at(-1)?.time).toBe("21:00");
    expect(slots).toHaveLength(15); // 17:30 … 21:00 im 15-Minuten-Raster
    expect(slots[0].start.toISOString()).toBe("2026-11-03T16:30:00.000Z");
    expect(slots[0].end.toISOString()).toBe("2026-11-03T18:00:00.000Z");
  });

  it("nutzt ohne letzten Einlass das Schichtende minus Verweildauer", () => {
    const { windows } = openingWindowsFor(
      TUESDAY,
      [{ ...shifts[0], lastSeatingTime: null }],
      [],
      30,
    );
    const slots = slotTimesFor(TUESDAY, windows, 120, BERLIN);
    expect(slots.at(-1)?.time).toBe("20:30"); // 22:30 − 2 h
  });

  it("unterstützt Schichten über Mitternacht", () => {
    const bar: ShiftDef = { ...shifts[0], weekday: 2, startTime: "22:00", endTime: "02:00", lastSeatingTime: null };
    const { windows } = openingWindowsFor(TUESDAY, [bar], [], 60);
    const slots = slotTimesFor(TUESDAY, windows, 120, BERLIN);
    expect(slots.map((s) => s.time)).toEqual(["22:00", "23:00", "00:00"]);
    expect(slots[2].start.toISOString()).toBe("2026-11-03T23:00:00.000Z"); // 00:00 am 04.11. Berlin
  });

  it("überspringt Slots in der ausgefallenen Stunde der Sommerzeitumstellung", () => {
    const night: ShiftDef = { ...shifts[0], weekday: 7, startTime: "01:00", endTime: "05:00", lastSeatingTime: "04:00" };
    const { windows } = openingWindowsFor("2026-03-29", [night], [], 30);
    const times = slotTimesFor("2026-03-29", windows, 60, BERLIN).map((s) => s.time);
    expect(times).toEqual(["01:00", "01:30", "03:00", "03:30", "04:00"]);
  });

  it("entfernt doppelte Slots aus überlappenden Schichten", () => {
    const a: ShiftDef = { ...shifts[0], id: "a", startTime: "17:00", lastSeatingTime: "18:00" };
    const b: ShiftDef = { ...shifts[0], id: "b", startTime: "17:30", lastSeatingTime: "18:30" };
    const { windows } = openingWindowsFor(TUESDAY, [a, b], [], 30);
    expect(slotTimesFor(TUESDAY, windows, 90, BERLIN).map((s) => s.time)).toEqual(["17:00", "17:30", "18:00", "18:30"]);
  });

  it("verwendet das Intervall der Schicht, falls gesetzt", () => {
    const { windows } = openingWindowsFor("2026-11-07", shifts, [], 15); // Samstag: Mittag (30 min) + Abend (15 min)
    const times = slotTimesFor("2026-11-07", windows, 90, BERLIN).map((s) => s.time);
    expect(times.slice(0, 4)).toEqual(["12:00", "12:30", "13:00", "13:30"]);
    expect(times).toContain("17:45");
  });
});

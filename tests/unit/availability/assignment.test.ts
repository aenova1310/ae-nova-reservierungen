import { describe, expect, it } from "vitest";
import { computeDayAvailability, resolveBooking } from "@/server/availability";
import { buildCandidates, freeCandidates, pickBest } from "@/server/availability/assign";
import { areas, at, combinations, INNEN, makeContext, occ, TABLES_ALL, TERRASSE, TUESDAY } from "./fixtures";

const slotAt = (time: string, partySize: number, ctx = makeContext(), areaId?: string) =>
  computeDayAvailability(ctx, { date: TUESDAY, partySize, channel: "ONLINE", areaId }).slots.find((s) => s.time === time)!;

describe("Kandidaten und Zuteilung", () => {
  it("vergibt den kleinsten passenden Einzeltisch zuerst", () => {
    expect(slotAt("18:00", 2).candidates[0].id).toBe("T1");
    expect(slotAt("18:00", 4).candidates[0].id).toBe("T3");
    expect(slotAt("18:00", 6).candidates[0].id).toBe("T5");
  });

  it("bevorzugt Einzeltische vor Kombinationen, auch wenn der Bereich wechselt", () => {
    const ctx = makeContext({ occupancies: [occ("T3", "17:00", "22:00"), occ("T4", "17:00", "22:00")] });
    const s = slotAt("18:00", 3, ctx);
    expect(s.candidates[0].id).toBe("P2"); // 4er auf der Terrasse
    expect(s.candidates.map((c) => c.id)).toContain("K12");
  });

  it("nutzt Kombinationen, wenn im gewünschten Bereich kein Einzeltisch frei ist", () => {
    const ctx = makeContext({ occupancies: [occ("T3", "17:00", "22:00"), occ("T4", "17:00", "22:00")] });
    const s = slotAt("18:00", 3, ctx, INNEN);
    expect(s.candidates[0].id).toBe("K12");
    expect(s.candidates.every((c) => c.areaId === INNEN)).toBe(true);
  });

  it("wählt bei Kombinationen die mit den wenigsten Tischen", () => {
    expect(slotAt("18:00", 7).candidates[0].id).toBe("K34"); // T3+T4 vor T1+T2+T3
  });

  it("blockiert eine Kombination, sobald ein beteiligter Tisch belegt ist", () => {
    const ctx = makeContext({ occupancies: [occ("T4", "18:30", "20:00")] });
    const ids = slotAt("18:00", 7, ctx).candidates.map((c) => c.id);
    expect(ids).not.toContain("K34");
    expect(ids).toContain("K123");
  });

  it("zeigt einen Slot nicht, wenn keine Kombination und kein Tisch passt", () => {
    const ctx = makeContext({ occupancies: [occ("T3", "17:00", "23:00")] });
    // 7 Personen: K34 und K123 brauchen T3
    expect(slotAt("18:00", 7, ctx).available).toBe(false);
    expect(slotAt("18:00", 7, ctx).reason).toBe("FULL");
  });

  it("lässt Buchungen direkt im Anschluss zu und respektiert den Puffer", () => {
    // 2 Personen = 90 min; T1, T2, P1 belegt bis 19:30
    const busy = [occ("T1", "18:00", "19:30"), occ("T2", "18:00", "19:30"), occ("P1", "18:00", "19:30")];
    const noBuffer = makeContext({ occupancies: busy });
    expect(slotAt("19:30", 2, noBuffer).candidates[0].id).toBe("T1");

    // Mit 15 min Puffer blockiert die neue Buchung bis 21:15 – vorher belegter Tisch
    // ist um 19:30 frei, aber eine spätere Belegung ab 21:00 kollidiert mit dem Puffer.
    const withBuffer = makeContext({
      rules: { bufferMinutes: 15 },
      occupancies: [...busy, occ("T1", "21:00", "22:30")],
    });
    expect(slotAt("19:30", 2, withBuffer).candidates[0].id).toBe("T2");
  });

  it("berücksichtigt Online-Buchbarkeit von Tisch und Bereich nur für Online-Buchungen", () => {
    const tables = TABLES_ALL.map((t) => (t.id === "T1" ? { ...t, onlineBookable: false } : t));
    const closedTerrace = areas.map((a) => (a.id === TERRASSE ? { ...a, onlineBookable: false } : a));
    const online = buildCandidates(2, "ONLINE", tables, combinations, closedTerrace).map((c) => c.id);
    const staff = buildCandidates(2, "STAFF", tables, combinations, closedTerrace).map((c) => c.id);
    expect(online).toEqual(["T2", "T3", "T4"]);
    expect(staff).toEqual(["T1", "T2", "P1", "T3", "T4", "P2"]);
  });

  it("ignoriert deaktivierte Tische und Kombinationen", () => {
    const tables = TABLES_ALL.map((t) => (t.id === "T5" ? { ...t, active: false } : t));
    const combos = combinations.map((c) => (c.id === "K34" ? { ...c, active: false } : c));
    expect(buildCandidates(6, "ONLINE", tables, combos, areas).map((c) => c.id)).toEqual(["K123"]);
  });

  it("pickBest filtert nach Bereich", () => {
    const ranked = buildCandidates(2, "ONLINE", TABLES_ALL, combinations, areas);
    const free = freeCandidates(ranked, at("18:00"), at("19:30"), []);
    expect(pickBest(free, TERRASSE)?.id).toBe("P1");
    expect(pickBest(free)?.id).toBe("T1");
  });
});

describe("Buchungsprüfung (resolveBooking)", () => {
  const base = { date: TUESDAY, start: at("18:00"), partySize: 2, channel: "ONLINE" as const };

  it("vergibt automatisch den bestpassenden Tisch inkl. Ende und Puffer", () => {
    const r = resolveBooking(makeContext({ rules: { bufferMinutes: 15 } }), base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidate.id).toBe("T1");
    expect(r.end.toISOString()).toBe(at("19:30").toISOString());
    expect(r.blockedUntil.toISOString()).toBe(at("19:45").toISOString());
  });

  it("lehnt Online-Buchungen außerhalb des Slot-Rasters ab, Personal darf frei wählen", () => {
    expect(resolveBooking(makeContext(), { ...base, start: at("18:07") })).toEqual({ ok: false, code: "INVALID_TIME" });
    expect(resolveBooking(makeContext(), { ...base, start: at("18:07"), channel: "STAFF" }).ok).toBe(true);
  });

  it("meldet TABLE_TAKEN, wenn der gewählte Tisch inzwischen belegt ist", () => {
    const ctx = makeContext({ occupancies: [occ("P1", "17:00", "18:30")] });
    expect(resolveBooking(ctx, { ...base, choice: { kind: "table", id: "P1" } })).toEqual({ ok: false, code: "TABLE_TAKEN" });
  });

  it("meldet INVALID_CHOICE für unpassende Tische – außer für Personal", () => {
    const choice = { kind: "table" as const, id: "T1" };
    expect(resolveBooking(makeContext(), { ...base, partySize: 3, choice })).toEqual({ ok: false, code: "INVALID_CHOICE" });
    const staff = resolveBooking(makeContext(), { ...base, partySize: 3, choice, channel: "STAFF" });
    expect(staff.ok && staff.candidate.id).toBe("T1");
  });

  it("meldet NO_TABLE, wenn alles belegt ist", () => {
    const ctx = makeContext({
      occupancies: TABLES_ALL.map((t) => occ(t.id, "17:00", "23:00")),
    });
    expect(resolveBooking(ctx, base)).toEqual({ ok: false, code: "NO_TABLE" });
  });

  it("ignoriert bei Umbuchung die eigene bestehende Belegung", () => {
    const ctx = makeContext({
      occupancies: TABLES_ALL.filter((t) => t.id !== "T1").map((t) => occ(t.id, "17:00", "23:00")).concat(occ("T1", "17:30", "19:00", "eigene")),
    });
    expect(resolveBooking(ctx, base).ok).toBe(false);
    const r = resolveBooking(ctx, { ...base, ignoreReservationId: "eigene" });
    expect(r.ok && r.candidate.id).toBe("T1");
  });
});

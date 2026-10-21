import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { FeatureNotInPlanError } from "@/server/plans/features";
import { fillPeriods, guestsByWeekdayHour, statsByPeriod, summarize } from "@/server/stats/queries";
import { createRestaurant, resetDatabase } from "../support/factory";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

async function insert(restaurantId: string, startsAt: string, partySize: number, status: string, source = "ONLINE") {
  const start = new Date(startsAt);
  await db.reservation.create({
    data: {
      restaurantId,
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      status: status as never,
      source: source as never,
      partySize,
      startsAt: start,
      endsAt: new Date(start.getTime() + 2 * 3_600_000),
    },
  });
}

describe("Statistik", () => {
  it("ist im Basic-Tarif serverseitig gesperrt", async () => {
    const { restaurant } = await createRestaurant("basic-stats");
    await expect(statsByPeriod({ ...restaurant, planCode: "BASIC" }, "week", new Date(0), new Date())).rejects.toBeInstanceOf(FeatureNotInPlanError);
  });

  it("zählt pro Woche in Ortszeit und berechnet No-Show-Quote und Online-Anteil", async () => {
    const { restaurant } = await createRestaurant("pro-stats");
    const r = { ...restaurant, planCode: "PRO" as const };
    // Woche ab Mo 02.11.2026
    await insert(r.id, "2026-11-03T18:00:00Z", 4, "ARRIVED");
    await insert(r.id, "2026-11-04T18:00:00Z", 2, "NO_SHOW", "PHONE");
    await insert(r.id, "2026-11-05T18:00:00Z", 3, "CANCELLED");
    // Mo 09.11. 00:30 Berlin = So 08.11. 23:30 UTC → gehört zur Woche ab 09.11.
    await insert(r.id, "2026-11-08T23:30:00Z", 2, "ARRIVED", "WALK_IN");

    const rows = await statsByPeriod(r, "week", new Date("2026-11-01T00:00:00Z"), new Date("2026-11-16T00:00:00Z"));
    expect(rows.map((x) => x.period)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(rows[0]).toMatchObject({ reservations: 2, guests: 6, noShows: 1, settled: 2, cancellations: 1, online: 1 });
    expect(rows[1]).toMatchObject({ reservations: 1, walkIns: 1 });

    const s = summarize(rows);
    expect(s.noShowRate).toBeCloseTo(1 / 3);
    expect(s.onlineShare).toBeCloseTo(1 / 3);
    expect(s.avgPartySize).toBeCloseTo(8 / 3);

    const filled = fillPeriods(rows, "week", "2026-10-26", "2026-11-15");
    expect(filled.map((x) => x.period)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(filled[0].reservations).toBe(0);

    const heat = await guestsByWeekdayHour(r, new Date("2026-11-01T00:00:00Z"), new Date("2026-11-16T00:00:00Z"));
    expect(heat).toContainEqual({ weekday: 1, hour: 0, guests: 2, reservations: 1 });
    expect(heat).toContainEqual({ weekday: 2, hour: 19, guests: 4, reservations: 1 });
    expect(heat.find((c) => c.weekday === 4)).toBeUndefined(); // stornierte zählen nicht
  });
});

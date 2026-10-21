/**
 * Öffentliche API der Verfügbarkeitslogik (rein, ohne Datenbank).
 *
 * - `computeDayAvailability` liefert die Slots eines Tages für das Widget/Admin.
 * - `resolveBooking` prüft einen konkreten Buchungswunsch und wählt die Tische.
 *   Sie wird in der Buchungstransaktion (unter Advisory-Lock) erneut aufgerufen –
 *   was der Client schickt, ist nur ein Wunsch.
 */
import { buildCandidates, freeCandidates, pickBest } from "./assign";
import { fitsOnlineQuota, onlineQuotaLimit, onlineSeatCapacity } from "./quota";
import { durationFor, openingWindowsFor, slotTimesFor } from "./slots";
import { addMinutes, daysBetween, utcToLocalDate, type LocalDate } from "./time";
import type { AvailabilityContext, AvailabilityQuery, BookingChannel, Candidate, DayAvailability, Slot } from "./types";

export * from "./types";
export { durationFor } from "./slots";

function partySizeAllowed(partySize: number, channel: BookingChannel, ctx: AvailabilityContext): boolean {
  if (!Number.isInteger(partySize) || partySize < 1) return false;
  if (channel === "STAFF") return true;
  return partySize >= ctx.rules.minPartySize && partySize <= ctx.rules.maxPartySizeOnline;
}

function dateInBookingRange(date: LocalDate, ctx: AvailabilityContext): boolean {
  const today = utcToLocalDate(ctx.now, ctx.rules.timezone);
  const diff = daysBetween(today, date);
  return diff >= 0 && diff <= ctx.rules.maxAdvanceDays;
}

export function computeDayAvailability(ctx: AvailabilityContext, query: AvailabilityQuery): DayAvailability {
  const { rules } = ctx;
  const duration = durationFor(query.partySize, rules);
  const base = { date: query.date, durationMinutes: duration };

  if (!partySizeAllowed(query.partySize, query.channel, ctx)) {
    return { ...base, closed: true, closedReason: "PARTY_SIZE", slots: [] };
  }
  if (query.channel === "ONLINE" && !dateInBookingRange(query.date, ctx)) {
    return { ...base, closed: true, closedReason: "OUT_OF_RANGE", slots: [] };
  }

  const { windows, closedBy } = openingWindowsFor(query.date, ctx.shifts, ctx.exceptions, rules.slotIntervalMinutes);
  if (closedBy) return { ...base, closed: true, closedReason: closedBy, slots: [] };

  const candidates = buildCandidates(query.partySize, query.channel, ctx.tables, ctx.combinations, ctx.areas);
  const quotaLimit = onlineQuotaLimit(onlineSeatCapacity(ctx.tables, ctx.areas), rules.onlineQuotaPercent);
  const earliest = addMinutes(ctx.now, query.channel === "ONLINE" ? rules.minLeadTimeMinutes : 0);

  const slots: Slot[] = [];
  for (const st of slotTimesFor(query.date, windows, duration, rules.timezone)) {
    if (query.channel === "ONLINE" && st.start < earliest) continue;

    const blockedUntil = addMinutes(st.end, rules.bufferMinutes);
    let free = freeCandidates(candidates, st.start, blockedUntil, ctx.occupancies, query.ignoreReservationId);
    if (query.areaId) free = free.filter((c) => c.areaId === query.areaId);

    let available = free.length > 0;
    let reason: Slot["reason"] = available ? undefined : "FULL";
    if (
      available &&
      query.channel === "ONLINE" &&
      !fitsOnlineQuota(query.partySize, st.start, st.end, ctx.onlineLoads, quotaLimit, query.ignoreReservationId)
    ) {
      available = false;
      reason = "QUOTA";
    }

    slots.push({ ...st, available, reason, candidates: available ? free : [] });
  }

  return { ...base, closed: false, slots };
}

/** Kandidat für eine explizite Personal-Wahl, ohne Kapazitätsgrenzen. */
function staffCandidateIgnoringCapacity(
  ctx: AvailabilityContext,
  choice: { kind: "table" | "combination"; id: string },
): Candidate | undefined {
  const all = buildCandidates(1, "STAFF", ctx.tables.map((t) => ({ ...t, minCapacity: 1, maxCapacity: 999 })), ctx.combinations.map((c) => ({ ...c, minCapacity: 1, maxCapacity: 999 })), ctx.areas);
  const found = all.find((c) => c.kind === choice.kind && c.id === choice.id);
  if (!found) return undefined;
  // echte Kapazitäten für die Anzeige wiederherstellen
  const original = choice.kind === "table" ? ctx.tables.find((t) => t.id === choice.id) : ctx.combinations.find((c) => c.id === choice.id);
  return original ? { ...found, minCapacity: original.minCapacity, maxCapacity: original.maxCapacity } : found;
}

export type BookingErrorCode =
  | "PARTY_SIZE"
  | "OUT_OF_RANGE"
  | "CLOSED"
  | "INVALID_TIME"
  | "TOO_SOON"
  | "NO_TABLE"
  | "TABLE_TAKEN"
  | "INVALID_CHOICE"
  | "QUOTA";

export interface BookingRequest {
  date: LocalDate;
  start: Date;
  partySize: number;
  channel: BookingChannel;
  areaId?: string | null;
  /** Gewählter Tisch/Kombination (Tischwahl durch Gast oder Personal). */
  choice?: { kind: "table" | "combination"; id: string } | null;
  /** Nur Personal: abweichende Verweildauer. */
  durationOverrideMinutes?: number | null;
  ignoreReservationId?: string | null;
}

export type BookingResolution =
  | { ok: true; candidate: Candidate; start: Date; end: Date; blockedUntil: Date }
  | { ok: false; code: BookingErrorCode };

export function resolveBooking(ctx: AvailabilityContext, req: BookingRequest): BookingResolution {
  const { rules } = ctx;
  if (!partySizeAllowed(req.partySize, req.channel, ctx)) return { ok: false, code: "PARTY_SIZE" };

  const duration =
    req.channel === "STAFF" && req.durationOverrideMinutes ? req.durationOverrideMinutes : durationFor(req.partySize, rules);
  const start = req.start;
  const end = addMinutes(start, duration);
  const blockedUntil = addMinutes(end, rules.bufferMinutes);

  if (req.channel === "ONLINE") {
    if (!dateInBookingRange(req.date, ctx)) return { ok: false, code: "OUT_OF_RANGE" };
    if (start < addMinutes(ctx.now, rules.minLeadTimeMinutes)) return { ok: false, code: "TOO_SOON" };
    // Online nur exakt auf einem angebotenen Slot
    const { windows, closedBy } = openingWindowsFor(req.date, ctx.shifts, ctx.exceptions, rules.slotIntervalMinutes);
    if (closedBy) return { ok: false, code: "CLOSED" };
    const onGrid = slotTimesFor(req.date, windows, duration, rules.timezone).some(
      (s) => s.start.getTime() === start.getTime(),
    );
    if (!onGrid) return { ok: false, code: "INVALID_TIME" };
  }

  const candidates = buildCandidates(req.partySize, req.channel, ctx.tables, ctx.combinations, ctx.areas);
  const free = freeCandidates(candidates, start, blockedUntil, ctx.occupancies, req.ignoreReservationId);

  let chosen: Candidate | null;
  if (req.choice) {
    let exists = candidates.find((c) => c.kind === req.choice!.kind && c.id === req.choice!.id);
    // Personal darf bewusst außerhalb der Kapazität setzen (z. B. Zusatzstuhl).
    if (!exists && req.channel === "STAFF") exists = staffCandidateIgnoringCapacity(ctx, req.choice);
    if (!exists) return { ok: false, code: "INVALID_CHOICE" };
    const target = exists;
    chosen = freeCandidates([target], start, blockedUntil, ctx.occupancies, req.ignoreReservationId)[0] ?? null;
    if (!chosen) return { ok: false, code: "TABLE_TAKEN" };
  } else {
    chosen = pickBest(free, req.areaId);
    if (!chosen) return { ok: false, code: "NO_TABLE" };
  }

  if (req.channel === "ONLINE") {
    const limit = onlineQuotaLimit(onlineSeatCapacity(ctx.tables, ctx.areas), rules.onlineQuotaPercent);
    if (!fitsOnlineQuota(req.partySize, start, end, ctx.onlineLoads, limit, req.ignoreReservationId)) {
      return { ok: false, code: "QUOTA" };
    }
  }

  return { ok: true, candidate: chosen, start, end, blockedUntil };
}

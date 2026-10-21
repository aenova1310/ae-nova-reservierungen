import "server-only";
import { db } from "../db";
import { computeDayAvailability, type Candidate } from "../availability";
import { loadAvailabilityContext, loadRestaurantConfig } from "../availability/load";
import { addDaysToDate, daysBetween, utcToLocalDate, type LocalDate } from "../availability/time";
import { hasFeature } from "../plans/features";
import { readableOn, isHexColor } from "@/lib/color";
import { logoView, publicTableMedia, type TableMediaView } from "../media/service";

/** Öffentliche, für Gäste unbedenkliche Restaurantdaten für das Widget. */
export async function getPublicRestaurant(slug: string) {
  const r = await db.restaurant.findUnique({
    where: { slug },
    include: { settings: true, branding: true, areas: { orderBy: { sortOrder: "asc" } } },
  });
  if (!r || !r.settings) return null;
  const brand = r.branding && isHexColor(r.branding.primaryColor) ? r.branding.primaryColor : "#6B1E2E";
  return {
    slug: r.slug,
    name: r.name,
    phone: r.phone,
    city: r.city,
    timezone: r.timezone,
    suspended: r.status !== "ACTIVE",
    allocationMode: r.settings.allocationMode,
    confirmationMode: r.settings.confirmationMode,
    minPartySize: r.settings.minPartySize,
    maxPartySizeOnline: r.settings.maxPartySizeOnline,
    maxAdvanceDays: r.settings.maxAdvanceDays,
    areas: r.areas.filter((a) => a.onlineBookable).map((a) => ({ id: a.id, name: a.name, nameEn: a.nameEn })),
    privacy: {
      de: r.settings.privacyNoticeDe,
      en: r.settings.privacyNoticeEn,
      policyUrl: r.settings.privacyPolicyUrl,
      anonymizeAfterDays: r.settings.anonymizeAfterDays,
    },
    logo: logoView(r.branding),
    branding: {
      color: brand,
      colorContrast: readableOn(brand),
      font: r.branding?.fontFamily ?? "serif-classic",
      theme: r.branding?.themeMode ?? "LIGHT",
      corner: r.branding?.cornerStyle ?? "soft",
    },
    showPoweredBy: !hasFeature(r.planCode, "removePoweredBy"),
    today: utcToLocalDate(new Date(), r.timezone),
  };
}

export type PublicRestaurant = NonNullable<Awaited<ReturnType<typeof getPublicRestaurant>>>;

export interface PublicCandidate {
  kind: "table" | "combination";
  id: string;
  name: string;
  areaId: string | null;
  minCapacity: number;
  maxCapacity: number;
  /** Tischansicht (nur Pro, nur Einzeltische) */
  media: TableMediaView | null;
}

const toPublicCandidate = (c: Candidate, media: Map<string, TableMediaView>): PublicCandidate => ({
  kind: c.kind,
  id: c.id,
  name: c.name,
  areaId: c.areaId,
  minCapacity: c.minCapacity,
  maxCapacity: c.maxCapacity,
  media: c.kind === "table" ? (media.get(c.id) ?? null) : null,
});

/** Freie Slots eines Tages (nur verfügbare werden ausgeliefert). */
export async function getPublicAvailability(slug: string, date: LocalDate, partySize: number) {
  const r = await db.restaurant.findUnique({ where: { slug }, select: { id: true, status: true, planCode: true } });
  if (!r || r.status !== "ACTIVE") return null;
  const config = await loadRestaurantConfig(db, r.id);
  const ctx = await loadAvailabilityContext(db, config, date);
  const showTables = config.allocationMode === "GUEST_CHOOSES_TABLE";
  const media = showTables ? await publicTableMedia(r) : new Map<string, TableMediaView>();
  const day = computeDayAvailability(ctx, { date, partySize, channel: "ONLINE" });
  return {
    date,
    closed: day.closed,
    closedReason: day.closedReason ?? null,
    durationMinutes: day.durationMinutes,
    slots: day.slots
      .filter((s) => s.available)
      .map((s) => ({
        time: s.time,
        shift: s.shiftName,
        // Im Auto-Modus nur die Bereiche, nicht die einzelnen Tische preisgeben
        areaIds: [...new Set(s.candidates.map((c) => c.areaId).filter((a): a is string => !!a))],
        candidates: showTables ? s.candidates.map((c) => toPublicCandidate(c, media)) : [],
      })),
  };
}

/** Übersicht für den Kalender: an welchen Tagen gibt es überhaupt freie Slots? */
export async function getPublicDays(slug: string, from: LocalDate, partySize: number, days = 42) {
  const r = await db.restaurant.findUnique({ where: { slug }, select: { id: true, status: true, timezone: true } });
  if (!r || r.status !== "ACTIVE") return null;
  const config = await loadRestaurantConfig(db, r.id);
  const today = utcToLocalDate(new Date(), r.timezone);
  const start = daysBetween(today, from) < 0 ? today : from;
  const until = addDaysToDate(start, Math.min(days, 62) - 1);
  const ctx = await loadAvailabilityContext(db, config, start, new Date(), until);

  const result: { date: LocalDate; available: boolean }[] = [];
  for (let d = start; d <= until; d = addDaysToDate(d, 1)) {
    const day = computeDayAvailability(ctx, { date: d, partySize, channel: "ONLINE" });
    result.push({ date: d, available: !day.closed && day.slots.some((s) => s.available) });
  }
  return result;
}

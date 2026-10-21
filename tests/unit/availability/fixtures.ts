import type {
  AreaDef,
  AvailabilityContext,
  BookingRules,
  CombinationDef,
  OnlineLoad,
  ShiftDef,
  TableDef,
  TableOccupancy,
} from "@/server/availability";

/**
 * Testrestaurant (Europe/Berlin):
 * - Abend Di–So 17:30–22:30, letzter Slot 21:00; Mittag Sa+So 12:00–15:00; Montag Ruhetag
 * - Innen: T1 (1–2), T2 (1–2), T3 (2–4), T4 (2–4), T5 (4–6)
 * - Terrasse: P1 (1–2), P2 (2–4)
 * - Kombinationen: T1+T2 (3–4), T3+T4 (5–8), T1+T2+T3 (6–9)
 */
export const INNEN = "area-innen";
export const TERRASSE = "area-terrasse";

export const areas: AreaDef[] = [
  { id: INNEN, name: "Innen", onlineBookable: true, sortOrder: 0 },
  { id: TERRASSE, name: "Terrasse", onlineBookable: true, sortOrder: 1 },
];

const t = (id: string, areaId: string, min: number, max: number, sortOrder: number): TableDef => ({
  id,
  name: id,
  areaId,
  minCapacity: min,
  maxCapacity: max,
  onlineBookable: true,
  active: true,
  sortOrder,
});

export const tables: TableDef[] = [
  t("T1", INNEN, 1, 2, 1),
  t("T2", INNEN, 1, 2, 2),
  t("T3", INNEN, 2, 4, 3),
  t("T4", INNEN, 2, 4, 4),
  t("T5", INNEN, 4, 6, 5),
  t("P1", TERRASSE, 1, 2, 10),
  t("P2", TERRASSE, 2, 4, 11),
];

export const combinations: CombinationDef[] = [
  { id: "K12", name: "T1 + T2", tableIds: ["T1", "T2"], minCapacity: 3, maxCapacity: 4, onlineBookable: true, active: true },
  { id: "K34", name: "T3 + T4", tableIds: ["T3", "T4"], minCapacity: 5, maxCapacity: 8, onlineBookable: true, active: true },
  { id: "K123", name: "T1 + T2 + T3", tableIds: ["T1", "T2", "T3"], minCapacity: 6, maxCapacity: 9, onlineBookable: true, active: true },
];

const evening = (weekday: number): ShiftDef => ({
  id: `abend-${weekday}`,
  name: "Abend",
  weekday,
  startTime: "17:30",
  endTime: "22:30",
  lastSeatingTime: "21:00",
  slotIntervalMinutes: null,
  validFrom: null,
  validUntil: null,
});

const lunch = (weekday: number): ShiftDef => ({
  id: `mittag-${weekday}`,
  name: "Mittag",
  weekday,
  startTime: "12:00",
  endTime: "15:00",
  lastSeatingTime: "13:30",
  slotIntervalMinutes: 30,
  validFrom: null,
  validUntil: null,
});

export const shifts: ShiftDef[] = [2, 3, 4, 5, 6, 7].map(evening).concat([6, 7].map(lunch));

/** Dienstag, 03.11.2026 (Winterzeit, UTC+1). */
export const TUESDAY = "2026-11-03";
/** Berlin 18:00 am Dienstag = 17:00 UTC. */
export const at = (localTime: string, date = TUESDAY): Date => {
  const [h, m] = localTime.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  // Winterzeit-Offset +1h (nur für Daten im Winter verwenden!)
  return new Date(Date.UTC(y, mo - 1, d, h - 1, m));
};

export function occ(tableId: string, from: string, to: string, reservationId = `r-${tableId}-${from}`): TableOccupancy {
  return { tableId, start: at(from), end: at(to), reservationId };
}

export function load(from: string, to: string, partySize: number, reservationId = `l-${from}-${partySize}`): OnlineLoad {
  return { reservationId, start: at(from), end: at(to), partySize };
}

export const defaultRules: BookingRules = {
  timezone: "Europe/Berlin",
  slotIntervalMinutes: 15,
  bufferMinutes: 0,
  defaultDurationMinutes: 120,
  durationRules: [
    { minPartySize: 1, maxPartySize: 2, durationMinutes: 90 },
    { minPartySize: 3, maxPartySize: 4, durationMinutes: 120 },
    { minPartySize: 5, maxPartySize: 20, durationMinutes: 150 },
  ],
  minPartySize: 1,
  maxPartySizeOnline: 8,
  minLeadTimeMinutes: 60,
  maxAdvanceDays: 90,
  onlineQuotaPercent: 100,
};

type ContextOverrides = Partial<Omit<AvailabilityContext, "rules">> & { rules?: Partial<BookingRules> };

export function makeContext(overrides: ContextOverrides = {}): AvailabilityContext {
  const { rules, ...rest } = overrides;
  return {
    rules: { ...defaultRules, ...rules },
    shifts,
    exceptions: [],
    areas,
    tables,
    combinations,
    occupancies: [],
    onlineLoads: [],
    // Sonntag, 01.11.2026, 11:00 Berlin
    now: new Date(Date.UTC(2026, 10, 1, 10, 0)),
    ...rest,
  };
}
export const TABLES_ALL = tables;

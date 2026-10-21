/** Datenformen, die das Widget von der öffentlichen API bekommt. */
export interface WidgetRestaurant {
  slug: string;
  name: string;
  phone: string | null;
  timezone: string;
  allocationMode: "GUEST_CHOOSES_TABLE" | "AUTOMATIC";
  confirmationMode: "AUTOMATIC" | "MANUAL";
  minPartySize: number;
  maxPartySizeOnline: number;
  maxAdvanceDays: number;
  areas: { id: string; name: string; nameEn: string | null }[];
  privacy: { de: string | null; en: string | null; policyUrl: string | null; anonymizeAfterDays: number };
  showPoweredBy: boolean;
  today: string;
}

export interface WidgetCandidate {
  kind: "table" | "combination";
  id: string;
  name: string;
  areaId: string | null;
  minCapacity: number;
  maxCapacity: number;
}

export interface WidgetSlot {
  time: string;
  shift: string;
  areaIds: string[];
  candidates: WidgetCandidate[];
}

export interface WidgetAvailability {
  date: string;
  closed: boolean;
  closedReason: string | null;
  durationMinutes: number;
  slots: WidgetSlot[];
}

export interface BookingResult {
  code: string;
  status: "CONFIRMED" | "REQUESTED" | "PENDING_PAYMENT";
  startsAt: string;
  endsAt: string;
  tableNames: string[];
}

import type { BookingErrorCode } from "../availability";

export type ReservationErrorCode =
  | BookingErrorCode
  | "NOT_FOUND"
  | "NOT_CANCELLABLE"
  | "NOT_MODIFIABLE"
  | "PAYMENT_LOCKED"
  | "INVALID_TRANSITION"
  | "CONSENT_REQUIRED"
  | "RESTAURANT_SUSPENDED"
  | "CONFLICT";

/** Fachlicher Fehler mit stabilem Code – wird von der API in HTTP-Status übersetzt. */
export class ReservationError extends Error {
  constructor(
    readonly code: ReservationErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ReservationError";
  }
}

/** HTTP-Status je Fehlercode (öffentliche API). */
export function httpStatusFor(code: ReservationErrorCode): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "TABLE_TAKEN":
    case "NO_TABLE":
    case "QUOTA":
    case "CONFLICT":
      return 409;
    case "RESTAURANT_SUSPENDED":
      return 423;
    default:
      return 422;
  }
}

/** Erkennt die Verletzung des Exclusion-Constraints (Postgres 23P01). */
export function isOverlapViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const text = JSON.stringify(error, Object.getOwnPropertyNames(error));
  return text.includes("23P01") || text.includes("reservation_tables_no_overlap");
}

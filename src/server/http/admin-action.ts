import "server-only";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { FeatureNotInPlanError } from "../plans/features";
import { ReservationError, type ReservationErrorCode } from "../reservations/errors";

const RESERVATION_MESSAGES: Partial<Record<ReservationErrorCode, string>> = {
  TABLE_TAKEN: "Der Tisch ist zu dieser Zeit bereits belegt.",
  NO_TABLE: "Zu dieser Zeit ist kein passender Tisch frei.",
  INVALID_CHOICE: "Dieser Tisch passt nicht zur Personenzahl.",
  INVALID_TIME: "Ungültige Uhrzeit.",
  CLOSED: "An diesem Tag ist geschlossen.",
  PARTY_SIZE: "Ungültige Personenzahl.",
  NOT_FOUND: "Reservierung nicht gefunden.",
  NOT_CANCELLABLE: "Diese Reservierung kann nicht mehr storniert werden.",
  INVALID_TRANSITION: "Dieser Statuswechsel ist nicht möglich.",
  RESTAURANT_SUSPENDED: "Das Restaurant ist gesperrt.",
};

/** Zod-Fehler → { feld: meldung } */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Führt eine Admin-Action aus und übersetzt bekannte Fehler in Meldungen.
 * Redirect-/NotFound-Signale von Next werden durchgereicht.
 */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? "Gespeichert." };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: "Bitte Eingaben prüfen.", fieldErrors: fieldErrors(error) };
    if (error instanceof ReservationError) return { ok: false, error: RESERVATION_MESSAGES[error.code] ?? error.message };
    if (error instanceof FeatureNotInPlanError) return { ok: false, error: `${error.message} Bitte auf Pro wechseln.` };
    if (error instanceof UserFacingError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Fehler mit einer Meldung, die direkt angezeigt werden darf. */
export class UserFacingError extends Error {}

/** FormData → einfaches Objekt (leere Strings werden zu undefined). */
export function formObject(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value === "string") out[key] = value.trim() === "" ? undefined : value.trim();
  }
  return out;
}

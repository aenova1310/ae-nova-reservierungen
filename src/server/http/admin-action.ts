import "server-only";
import { z } from "zod";
import { msg, translateMessage, type AdminKey, type AdminT, type AdminVars } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { getAdminT } from "../i18n";
import { FeatureNotInPlanError } from "../plans/features";
import { ReservationError, type ReservationErrorCode } from "../reservations/errors";

const RESERVATION_MESSAGES: Partial<Record<ReservationErrorCode, AdminKey>> = {
  TABLE_TAKEN: "common.err.tableTaken",
  NO_TABLE: "common.err.noTable",
  INVALID_CHOICE: "common.err.invalidChoice",
  INVALID_TIME: "common.err.invalidTime",
  CLOSED: "common.err.closed",
  PARTY_SIZE: "common.err.partySize",
  NOT_FOUND: "common.err.reservationNotFound",
  NOT_CANCELLABLE: "common.err.notCancellable",
  INVALID_TRANSITION: "common.err.invalidTransition",
  RESTAURANT_SUSPENDED: "common.err.suspended",
};

/**
 * Zod-Fehler → { feld: meldung }. Meldungen in Schemas sind Schlüssel
 * (`msg("common.v.required")`); Zods eigene Standardtexte werden durch eine
 * allgemeine, übersetzte Meldung ersetzt.
 */
export function fieldErrors(error: z.ZodError, t?: AdminT): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (out[key]) continue;
    if (!t) out[key] = issue.message;
    else if (ZOD_DEFAULT.test(issue.message)) out[key] = fallback(t, issue);
    else out[key] = translateMessage(t, issue.message); // Schlüssel → Text; eigener Klartext bleibt
  }
  return out;
}

/** Standardmeldungen von Zod (englisch, technisch) erkennen. */
const ZOD_DEFAULT = /^(Invalid|Too (small|big)|Expected|Unrecognized)/;

function fallback(t: AdminT, issue: z.core.$ZodIssue): string {
  if (issue.code === "too_small" && typeof issue.minimum === "number" && issue.origin === "number") return t("common.v.min", { min: issue.minimum });
  if (issue.code === "too_big" && typeof issue.maximum === "number" && issue.origin === "number") return t("common.v.max", { max: issue.maximum });
  if (issue.code === "too_small") return t("common.v.required");
  return t("common.v.invalid");
}

/**
 * Führt eine Admin-Action aus und übersetzt bekannte Fehler in Meldungen der
 * Benutzersprache. Die Action bekommt die Übersetzungsfunktion für ihre
 * Erfolgsmeldung. Redirect-/NotFound-Signale von Next werden durchgereicht.
 */
export async function runAction(fn: (t: AdminT) => Promise<string | void>): Promise<ActionResult> {
  const { t } = await getAdminT();
  try {
    const message = await fn(t);
    return { ok: true, message: message ?? t("common.saved") };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: t("common.checkInput"), fieldErrors: fieldErrors(error, t) };
    if (error instanceof ReservationError) {
      const key = RESERVATION_MESSAGES[error.code];
      return { ok: false, error: key ? t(key) : error.message };
    }
    if (error instanceof FeatureNotInPlanError) return { ok: false, error: t("common.err.featureNotInPlan") };
    if (error instanceof UserFacingError) return { ok: false, error: translateMessage(t, error.message) };
    throw error;
  }
}

/**
 * Fehler mit einer Meldung, die direkt angezeigt werden darf. Bevorzugt mit
 * Schlüssel: `new UserFacingError("tables.err.duplicate", { name })`.
 */
export class UserFacingError extends Error {
  constructor(keyOrMessage: AdminKey | (string & {}), vars?: AdminVars) {
    super(vars ? msg(keyOrMessage as AdminKey, vars) : keyOrMessage);
  }
}

/** FormData → einfaches Objekt (leere Strings werden zu undefined). */
export function formObject(formData: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value === "string") out[key] = value.trim() === "" ? undefined : value.trim();
  }
  return out;
}

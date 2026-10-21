import "server-only";
import { createHmac } from "node:crypto";
import { env } from "../env";
import { hashToken } from "../crypto";

/**
 * Verwaltungs-Token für den Link in der Bestätigungs-E-Mail (Ändern/Stornieren
 * ohne Login). Das Token ist eine HMAC über Reservierungs-ID und Version:
 * - nicht erratbar (256 Bit), ohne Geheimnis nicht fälschbar
 * - jederzeit neu berechenbar → auch Erinnerungs-Mails enthalten denselben Link
 * - in der DB liegt nur der SHA-256-Hash (Lookup über eindeutigen Index)
 */
export function manageTokenFor(reservationId: string, tokenVersion: number): string {
  return createHmac("sha256", env().APP_SECRET).update(`manage:${reservationId}:${tokenVersion}`).digest("base64url");
}

export function manageTokenHashFor(reservationId: string, tokenVersion: number): string {
  return hashToken(manageTokenFor(reservationId, tokenVersion));
}

export function manageUrl(slug: string, token: string, locale = "de"): string {
  const url = new URL(`/r/${encodeURIComponent(slug)}/m/${token}`, env().APP_URL);
  if (locale !== "de") url.searchParams.set("lang", locale);
  return url.toString();
}

/** Plausibilitätsprüfung, bevor die DB gefragt wird. */
export function looksLikeManageToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

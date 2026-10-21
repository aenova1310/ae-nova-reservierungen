import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { ADMIN_MESSAGES, createAdminT, type AdminT } from "@/i18n/admin";
import type { Locale } from "@/i18n/messages";
import { getSessionUser } from "./auth/session";

/** Cookie für die Sprache vor der Anmeldung (Login, Passwort, Einladung). */
export const ADMIN_LOCALE_COOKIE = "nova_lang";

/**
 * Sprache der Verwaltungsoberfläche: Einstellung des angemeldeten Benutzers,
 * sonst Cookie, sonst Browser-Sprache (Accept-Language), sonst Deutsch.
 */
export const getAdminLocale = cache(async (): Promise<Locale> => {
  const user = await getSessionUser();
  if (user) return user.locale;
  const cookie = (await cookies()).get(ADMIN_LOCALE_COOKIE)?.value;
  if (cookie === "de" || cookie === "en") return cookie;
  const accept = (await headers()).get("accept-language") ?? "";
  const first = accept.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : "de";
});

export async function getAdminT(): Promise<{ t: AdminT; locale: Locale }> {
  const locale = await getAdminLocale();
  return { t: createAdminT(ADMIN_MESSAGES[locale]), locale };
}

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { ADMIN_LOCALE_COOKIE } from "@/server/i18n";

/** Sprache der Verwaltung wechseln: beim Benutzer speichern (auch für Konto-Mails) und als Cookie für die Anmeldeseiten. */
export async function setAdminLocaleAction(locale: "de" | "en") {
  const value = locale === "en" ? "en" : "de";
  const user = await getSessionUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale: value } });
  (await cookies()).set(ADMIN_LOCALE_COOKIE, value, { path: "/", sameSite: "lax", maxAge: 365 * 86_400, httpOnly: true, secure: env().APP_URL.startsWith("https://") });
  revalidatePath("/admin", "layout");
  revalidatePath("/superadmin", "layout");
}

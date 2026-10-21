"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createAdminT, type AdminMessages, type AdminT } from "@/i18n/admin";
import type { Locale } from "@/i18n/messages";

const Ctx = createContext<{ locale: Locale; t: AdminT } | null>(null);

/**
 * Stellt Client-Komponenten der Verwaltung die Texte bereit. Der Server übergibt
 * nur das Wörterbuch der aktiven Sprache (kein zweites im Bundle).
 */
export function AdminI18nProvider({ locale, messages, children }: { locale: Locale; messages: AdminMessages; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createAdminT(messages) }), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminT(): { locale: Locale; t: AdminT } {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAdminT: AdminI18nProvider fehlt (Layout unter /admin bzw. /superadmin).");
  return value;
}

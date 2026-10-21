"use client";

import { Languages } from "lucide-react";
import { useTransition } from "react";
import { setAdminLocaleAction } from "@/app/admin/sprache/actions";
import { useAdminT } from "./i18n-provider";

/** Umschalter Deutsch ↔ Englisch (zeigt die jeweils andere Sprache in ihrer eigenen Schreibweise). */
export function LanguageSwitch({ className }: { className?: string }) {
  const { t, locale } = useAdminT();
  const [pending, start] = useTransition();
  const other = locale === "de" ? "en" : "de";
  return (
    <button
      type="button"
      lang={other}
      disabled={pending}
      aria-label={`${t("nav.language")}: ${t("nav.languageSwitch")}`}
      onClick={() => start(() => setAdminLocaleAction(other))}
      className={className ?? "inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"}
    >
      <Languages className="size-3.5" aria-hidden />
      {t("nav.languageSwitch")}
    </button>
  );
}

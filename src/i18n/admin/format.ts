import type { Locale } from "../messages";

/** Formatierung für die Verwaltungsoberfläche (Server und Client). */
export const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : "de-DE");

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return value.toLocaleString(intlLocale(locale), options);
}

export function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(intlLocale(locale), options);
}

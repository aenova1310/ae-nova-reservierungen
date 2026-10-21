import type { Locale } from "../messages";
import { common } from "./common";
import { floorplan } from "./floorplan";
import { live } from "./live";
import { reservations } from "./reservations";
import { setup } from "./setup";
import { stats } from "./stats";

/**
 * Texte der Verwaltungsoberfläche (Deutsch/Englisch), aufgeteilt nach Bereichen.
 * Schlüssel sind mit dem Bereich vorangestellt ("tables.…", "res.…"), damit
 * keine Überschneidungen entstehen.
 */
const de = { ...common.de, ...reservations.de, ...setup.de, ...floorplan.de, ...stats.de, ...live.de };
const en: Record<keyof typeof de, string> = { ...common.en, ...reservations.en, ...setup.en, ...floorplan.en, ...stats.en, ...live.en };

export type AdminKey = keyof typeof de;
export type AdminMessages = Record<AdminKey, string>;
export type AdminVars = Record<string, string | number>;
export type AdminT = (key: AdminKey, vars?: AdminVars) => string;

export const ADMIN_MESSAGES: Record<Locale, AdminMessages> = { de, en };

export function isAdminKey(value: string): value is AdminKey {
  return Object.prototype.hasOwnProperty.call(de, value);
}

export function createAdminT(messages: AdminMessages): AdminT {
  return (key, vars = {}) => {
    let text = messages[key] ?? de[key] ?? key;
    if (text.includes("|") && typeof vars.count === "number") {
      const [one, many] = text.split("|");
      text = vars.count === 1 ? one : many;
    }
    return text.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
  };
}

/**
 * Meldung als Schlüssel mit Werten kodieren – für Zod-Meldungen und
 * Fehlerklassen, die erst beim Anzeigen übersetzt werden:
 * `msg("common.v.min", { min: 1 })` → "common.v.min?min=1".
 */
export function msg(key: AdminKey, vars?: AdminVars): string {
  return vars ? `${key}?${new URLSearchParams(Object.entries(vars).map(([k, v]) => [k, String(v)]))}` : key;
}

/** Gegenstück zu `msg`: Schlüssel übersetzen, sonstigen Text unverändert lassen. */
export function translateMessage(t: AdminT, message: string): string {
  const [key, query] = message.split("?", 2);
  if (!isAdminKey(key)) return message;
  return t(key, query ? Object.fromEntries(new URLSearchParams(query)) : undefined);
}

"use client";

import { useMemo, useState } from "react";
import { useAdminT } from "@/components/admin/i18n-provider";
import { dateFormat } from "@/i18n/admin/format";
import type { Locale } from "@/i18n/messages";

/** Wochentagsnamen Mo–So (kurz ohne Punkt, wie bisher "Mo", "Di" …). */
function weekdayNames(locale: Locale) {
  const short = dateFormat(locale, { weekday: "short", timeZone: "UTC" });
  const long = dateFormat(locale, { weekday: "long", timeZone: "UTC" });
  // 1. Januar 2024 war ein Montag
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i, 12)));
  return { short: days.map((d) => short.format(d).replace(/\.$/, "")), long: days.map((d) => long.format(d)) };
}
/** Sequenzielle Skala: eine Farbe (Tinte), hell → dunkel, 5 Stufen. */
const STEPS = [0.1, 0.28, 0.46, 0.66, 0.88];

/**
 * Auslastungs-Heatmap Wochentag × Stunde (Gäste mit Reservierungsbeginn in dieser Stunde).
 * Werte stehen im Tooltip und in der Tabellenansicht – nicht nur in der Farbe.
 */
export function Heatmap({ cells, title }: { cells: { weekday: number; hour: number; guests: number; reservations: number }[]; title: string }) {
  const { t, locale } = useAdminT();
  const { short: WEEKDAYS, long: WEEKDAYS_LONG } = useMemo(() => weekdayNames(locale), [locale]);
  const [active, setActive] = useState<string | null>(null);
  if (cells.length === 0) return <p className="text-sm text-muted-foreground">{t("stats.heat.empty")}</p>;

  const hours = cells.map((c) => c.hour);
  const minH = Math.min(...hours);
  const maxH = Math.max(...hours);
  const hourList = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);
  const max = Math.max(...cells.map((c) => c.guests));
  const get = (w: number, h: number) => cells.find((c) => c.weekday === w && c.hour === h);
  const step = (v: number) => STEPS[Math.min(STEPS.length - 1, Math.floor((v / max) * STEPS.length))];
  const activeCell = active ? cells.find((c) => `${c.weekday}-${c.hour}` === active) : null;

  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 text-sm font-medium">{title}</figcaption>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `2.5rem repeat(${hourList.length}, minmax(1.75rem, 1fr))` }} onMouseLeave={() => setActive(null)}>
          <span />
          {hourList.map((h) => (
            <span key={h} className="tabular pb-1 text-center text-xs text-muted-foreground" aria-hidden>
              {h}
            </span>
          ))}
          {WEEKDAYS.map((wd, wi) => (
            <div key={wd} className="contents">
              <span className="pr-2 text-right text-xs leading-7 text-muted-foreground">{wd}</span>
              {hourList.map((h) => {
                const c = get(wi + 1, h);
                const id = `${wi + 1}-${h}`;
                return (
                  <span
                    key={h}
                    tabIndex={c ? 0 : -1}
                    role={c ? "img" : undefined}
                    aria-label={c ? t("stats.heat.cell", { weekday: WEEKDAYS_LONG[wi], hour: h, guests: c.guests, reservations: c.reservations }) : undefined}
                    onMouseEnter={() => c && setActive(id)}
                    onFocus={() => c && setActive(id)}
                    onBlur={() => setActive(null)}
                    className="h-7 rounded-[3px] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    style={{
                      background: c ? `color-mix(in oklab, var(--primary) ${step(c.guests) * 100}%, var(--card))` : "var(--muted)",
                      opacity: c ? 1 : 0.5,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5" aria-hidden>
          {t("stats.heat.less")}
          {STEPS.map((s) => (
            <span key={s} className="inline-block size-3 rounded-[2px]" style={{ background: `color-mix(in oklab, var(--primary) ${s * 100}%, var(--card))` }} />
          ))}
          {t("stats.heat.more")}
        </span>
        <span role="status" className="tabular min-h-4 text-foreground">
          {activeCell
            ? t("stats.heat.active", {
                weekday: WEEKDAYS_LONG[activeCell.weekday - 1],
                from: activeCell.hour,
                to: activeCell.hour + 1,
                guests: activeCell.guests,
                reservations: activeCell.reservations,
              })
            : ""}
        </span>
      </div>
    </figure>
  );
}

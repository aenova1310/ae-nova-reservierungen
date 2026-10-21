"use client";

import { useState } from "react";
import { useAdminT } from "@/components/admin/i18n-provider";
import { formatNumber } from "@/i18n/admin/format";
import { cn } from "@/lib/utils";

export interface BarDatum {
  key: string;
  /** Achsenbeschriftung (kurz) */
  label: string;
  /** Vollständige Bezeichnung für Tooltip und Screenreader */
  fullLabel: string;
  value: number | null;
  /** Formatierter Wert, z. B. "12 %" */
  display: string;
  /** Zusatzzeile im Tooltip */
  detail?: string;
}

/** "Schöne" Obergrenze für die y-Achse (1, 2, 2.5, 5 × 10^n). */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  // Ganzzahlige Achse für Zählwerte
  if (max >= 1 && max < 2) return 2;
  const exp = Math.floor(Math.log10(max));
  const base = 10 ** exp;
  for (const m of [1, 2, 2.5, 5, 10]) if (max <= m * base) return m * base;
  return 10 * base;
}

/**
 * Einreihiges Säulendiagramm (eine Kennzahl, eine Achse).
 * Dünne Säulen mit 4px-Rundung oben, 2px Abstand, zurückhaltendes Raster,
 * Tooltip bei Hover und Tastaturfokus, Beschriftung nur am letzten Wert.
 */
export function BarChart({
  title,
  data,
  axis = "number",
  height = 180,
}: {
  title: string;
  data: BarDatum[];
  /** Achsenformat (als Wert statt Funktion, damit Server-Komponenten es übergeben können) */
  axis?: "number" | "percent";
  height?: number;
}) {
  const { locale } = useAdminT();
  const formatAxis = (v: number) =>
    axis === "percent" ? `${Math.round(v * 100)} %` : formatNumber(v, locale, { maximumFractionDigits: 1 });
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value ?? 0)));
  // Zählwerte nur mit ganzzahligen Hilfslinien beschriften
  const ticks = axis === "number" && !Number.isInteger(max / 2) ? [0, max] : [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / 5));
  // Kurzwert für die Direktbeschriftung (nur Zahl, ohne Einheit-Text)
  const short = (v: number) =>
    axis === "percent" ? `${formatNumber(v * 100, locale, { maximumFractionDigits: 1 })} %` : formatNumber(v, locale);
  const last = data.length - 1;

  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 text-sm font-medium">{title}</figcaption>
      <div className="flex gap-2">
        {/* y-Achse */}
        <div className="tabular relative w-10 shrink-0 text-right text-xs text-muted-foreground" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
              {formatAxis(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="relative" style={{ height }} onMouseLeave={() => setActive(null)}>
            {ticks.map((t) => (
              <span key={t} aria-hidden className="absolute inset-x-0 border-t border-border/70" style={{ top: `${(1 - t / max) * 100}%` }} />
            ))}
            <ul className="absolute inset-0 flex items-end gap-[2px]" aria-label={title}>
              {data.map((d, i) => {
                const h = d.value === null ? 0 : (d.value / max) * 100;
                return (
                  <li key={d.key} className="relative flex h-full flex-1 items-end justify-center">
                    <button
                      type="button"
                      aria-label={`${d.fullLabel}: ${d.display}${d.detail ? `, ${d.detail}` : ""}`}
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                      className="group flex h-full w-full items-end justify-center outline-none"
                    >
                      <span
                        className={cn(
                          "block w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity",
                          active !== null && active !== i && "opacity-40",
                          d.value === null && "bg-transparent",
                          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring",
                        )}
                        style={{ height: `${h}%`, minHeight: d.value ? 2 : 0 }}
                      />
                    </button>
                    {i === last && d.value !== null && active === null ? (
                      <span className="tabular pointer-events-none absolute pb-1 text-xs font-medium whitespace-nowrap" style={{ bottom: `${h}%` }}>
                        {short(d.value)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {active !== null ? (
              <div
                role="status"
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-sm"
                style={{
                  left: `${((active + 0.5) / data.length) * 100}%`,
                  top: `${(1 - (data[active].value ?? 0) / max) * 100}%`,
                  marginTop: -6,
                }}
              >
                <span className="block text-muted-foreground">{data[active].fullLabel}</span>
                <span className="tabular font-medium">{data[active].display}</span>
                {data[active].detail ? <span className="block text-muted-foreground">{data[active].detail}</span> : null}
              </div>
            ) : null}
          </div>
          {/* x-Achse */}
          <div className="mt-1.5 flex gap-[2px] text-xs text-muted-foreground" aria-hidden>
            {data.map((d, i) => (
              <span key={d.key} className="relative flex-1 text-center">
                {(i % labelEvery === 0 && last - i >= labelEvery / 2) || i === last ? (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{d.label}</span>
                ) : null}
                &nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

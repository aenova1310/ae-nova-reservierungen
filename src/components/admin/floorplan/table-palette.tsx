"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { AdminT } from "@/i18n/admin";
import { TABLE_PRESETS, type PresetKey } from "./plan-ops";

/** Kleine Vorschau einer Vorlage (Tisch mit Stühlen). */
export function PresetIcon({ preset, size = 34 }: { preset: PresetKey; size?: number }) {
  const p = TABLE_PRESETS[preset];
  const scale = (size - 10) / Math.max(p.width, p.height);
  const w = p.width * scale;
  const h = p.height * scale;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  const seats = Math.min(p.max, 8);
  const dots: { cx: number; cy: number }[] = [];
  if (p.shape === "ROUND") {
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * 2 * Math.PI - Math.PI / 2;
      dots.push({ cx: size / 2 + (w / 2 + 3) * Math.cos(a), cy: size / 2 + (h / 2 + 3) * Math.sin(a) });
    }
  } else {
    const perSide = Math.ceil(seats / 2);
    for (let i = 0; i < perSide; i++) dots.push({ cx: x + (w * (i + 1)) / (perSide + 1), cy: y - 3 });
    for (let i = 0; i < seats - perSide; i++) dots.push({ cx: x + (w * (i + 1)) / (seats - perSide + 1), cy: y + h + 3 });
  }
  return (
    <svg width={size} height={size} aria-hidden className="shrink-0">
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={2} fill="#b9bec6" />
      ))}
      {p.shape === "ROUND" ? (
        <ellipse cx={size / 2} cy={size / 2} rx={w / 2} ry={h / 2} fill="#fff" stroke="#1d2433" strokeWidth={1.25} />
      ) : (
        <rect x={x} y={y} width={w} height={h} rx={2.5} fill="#fff" stroke="#1d2433" strokeWidth={1.25} />
      )}
    </svg>
  );
}

const ORDER: PresetKey[] = ["2round", "2square", "4rect", "4round", "6rect", "8rect"];

export function TablePalette({
  t,
  disabled,
  onAdd,
  onDragStart,
}: {
  t: AdminT;
  disabled: boolean;
  onAdd: (preset: PresetKey) => void;
  onDragStart: (e: ReactPointerEvent, preset: PresetKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2" role="group" aria-label={t("fp.palette")}>
      <span className="mr-1 text-sm font-medium">{t("fp.palette")}</span>
      {ORDER.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          // Klick legt an; Ziehen (über die Bewegungsschwelle) legt am Ablegepunkt an
          onClick={() => onAdd(key)}
          onPointerDown={(e) => onDragStart(e, key)}
          className="inline-flex touch-none items-center gap-1.5 rounded-md border bg-card py-1 pr-2.5 pl-1.5 text-sm hover:border-[#1d2433]/40 hover:bg-card focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing disabled:opacity-50"
          title={t("fp.paletteHint")}
        >
          <PresetIcon preset={key} />
          {t(`fp.preset.${key}`)}
        </button>
      ))}
      <span className="text-xs text-muted-foreground">{t("fp.paletteHint")}</span>
    </div>
  );
}

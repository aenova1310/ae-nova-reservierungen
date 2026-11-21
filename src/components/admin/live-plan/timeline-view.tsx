"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { AdminT } from "@/i18n/admin";
import type { PlanArea, PlanTable } from "@/lib/floorplan";
import { formatMin, MOVABLE_STATUSES, type LiveReservation, type MoveVerdict } from "@/lib/service-view";
import { cn } from "@/lib/utils";
import type { DragState } from "./use-move";

/**
 * Zeitleiste: eine Zeile je Tisch, Reservierungen als Balken (dahinter der
 * Puffer zum Eindecken). Balken lassen sich auf eine andere Zeile ziehen.
 */
const BAR: Record<string, string> = {
  PENDING_PAYMENT: "border-messing bg-[#f4eee2] text-[#5a4520] border-dashed",
  REQUESTED: "border-messing bg-[#f4eee2] text-[#5a4520] border-dashed",
  CONFIRMED: "border-[#1d2433] bg-[#e8eaee] text-[#1d2433]",
  ARRIVED: "border-salbei bg-[#dce8e0] text-[#24432f]",
  NO_SHOW: "border-bordeaux/50 bg-[#f6eef0] text-bordeaux line-through",
};

export function TimelineView({
  t,
  areas,
  tables,
  byTable,
  fromMin,
  toMin,
  at,
  nowMin,
  showNow,
  selected,
  drag,
  verdictFor,
  onSelect,
  onDragStart,
  statusText,
}: {
  t: AdminT;
  areas: PlanArea[];
  tables: PlanTable[];
  byTable: Map<string, LiveReservation[]>;
  fromMin: number;
  toMin: number;
  at: number;
  nowMin: number;
  showNow: boolean;
  selected: string | null;
  drag: DragState | null;
  verdictFor: (tableId: string) => MoveVerdict | null;
  onSelect: (tableId: string) => void;
  onDragStart: (e: ReactPointerEvent, r: LiveReservation, tableId: string) => void;
  statusText: (status: string) => string;
}) {
  const span = toMin - fromMin;
  const pct = (m: number) => `${((Math.min(Math.max(m, fromMin), toMin) - fromMin) / span) * 100}%`;
  const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => fromMin + i * 60);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="min-w-[860px]">
        <div className="relative ml-32 h-8 border-b text-xs text-muted-foreground" aria-hidden>
          {hours.map((m, i) => (
            <span
              key={m}
              className={cn("absolute top-2 tabular-nums", i === 0 ? "" : i === hours.length - 1 ? "-translate-x-full pr-1" : "-translate-x-1/2")}
              style={{ left: pct(m) }}
            >
              {formatMin(m)}
            </span>
          ))}
        </div>
        {areas.map((area) => {
          const rows = tables.filter((tb) => tb.areaId === area.id);
          if (!rows.length) return null;
          return (
            <section key={area.id} aria-label={area.name}>
              <h3 className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">{area.name}</h3>
              {rows.map((tb) => {
                const list = byTable.get(tb.id) ?? [];
                const v = drag ? verdictFor(tb.id) : null;
                const hover = drag?.over === tb.id;
                return (
                  <div
                    key={tb.id}
                    data-drop-table={tb.id}
                    className={cn(
                      "flex border-b transition-colors last:border-b-0",
                      selected === tb.id && "bg-muted/50",
                      drag?.fromTableId === tb.id && "opacity-60",
                      hover && v?.kind === "free" && !v.overCapacity && "bg-salbei/15",
                      hover && ((v?.kind === "free" && v.overCapacity) || v?.kind === "swap") && "bg-messing/15",
                      hover && v?.kind === "blocked" && "bg-bordeaux/10",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(tb.id)}
                      aria-label={t("live.tl.row", { name: tb.name, count: list.length })}
                      aria-pressed={selected === tb.id}
                      className="flex w-32 shrink-0 items-baseline gap-1.5 border-r px-3 py-2.5 text-left text-sm hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="font-medium">{tb.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {tb.minCapacity}–{tb.maxCapacity}
                      </span>
                    </button>
                    <div className="relative h-11 flex-1">
                      {/* Stundenlinien */}
                      {hours.map((m) => (
                        <span key={m} className="absolute inset-y-0 w-px bg-border/70" style={{ left: pct(m) }} aria-hidden />
                      ))}
                      {list.map((r) => {
                        const movable = MOVABLE_STATUSES.includes(r.status);
                        return (
                          <div key={r.id}>
                            {/* Puffer */}
                            <span
                              className="absolute top-1.5 bottom-1.5 rounded-r-sm bg-[repeating-linear-gradient(45deg,#eceeec,#eceeec_3px,#dcdfe3_3px,#dcdfe3_6px)]"
                              style={{ left: pct(r.endMin), width: `calc(${pct(r.blockedMin)} - ${pct(r.endMin)})` }}
                              aria-hidden
                            />
                            <button
                              type="button"
                              onPointerDown={(e) => movable && onDragStart(e, r, tb.id)}
                              onClick={() => onSelect(tb.id)}
                              title={`${formatMin(r.startMin)}–${formatMin(r.endMin)} · ${r.guestName ?? "–"} · ${r.partySize}`}
                              aria-label={`${formatMin(r.startMin)}–${formatMin(r.endMin)}, ${r.guestName ?? "–"}, ${t("live.guests", { count: r.partySize })}, ${statusText(r.status)}`}
                              className={cn(
                                "absolute top-1.5 bottom-1.5 flex items-center gap-1 overflow-hidden rounded-sm border-l-4 border px-1.5 text-left text-xs whitespace-nowrap shadow-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                                BAR[r.status] ?? BAR.CONFIRMED,
                                movable && "cursor-grab touch-none active:cursor-grabbing",
                                drag?.r.id === r.id && "ring-2 ring-bordeaux",
                              )}
                              style={{ left: pct(r.startMin), width: `calc(${pct(r.endMin)} - ${pct(r.startMin)})` }}
                            >
                              <span className="font-medium tabular-nums">{formatMin(r.startMin)}</span>
                              <span className="truncate">{r.guestName ?? "–"}</span>
                              <span className="tabular-nums opacity-80">{r.partySize}</span>
                            </button>
                          </div>
                        );
                      })}
                      {/* gewählte Uhrzeit und jetzt */}
                      <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-bordeaux/70" style={{ left: pct(at) }} aria-hidden />
                      {showNow && nowMin !== at ? <span className="pointer-events-none absolute inset-y-0 w-px border-l border-dashed border-bordeaux/60" style={{ left: pct(nowMin) }} aria-hidden /> : null}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

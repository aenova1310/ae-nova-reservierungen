"use client";

import { ChevronLeft, ChevronRight, Phone, Radio, StickyNote, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { changeStatusAction } from "@/app/admin/[restaurant]/reservierungen/actions";
import { useAdminT } from "@/components/admin/i18n-provider";
import { StatusActions } from "@/components/admin/status-actions";
import { seatPositions } from "@/components/admin/floorplan/plan-shapes";
import { Button } from "@/components/ui/button";
import { isAdminKey, type AdminT } from "@/i18n/admin";
import { canvasSize, rotatedBounds, tableCenter, type PlanTable } from "@/lib/floorplan";
import {
  LATE_AFTER_MIN,
  SOON_WITHIN_MIN,
  formatMin,
  occupancyCurve,
  tableSnapshot,
  type LivePlanData,
  type LiveReservation,
  type TableSnapshot,
  type TableState,
} from "@/lib/service-view";
import { cn } from "@/lib/utils";

/**
 * Live-Tischplan für den Service: Raumplan mit dem Zustand jedes Tisches zu
 * einer wählbaren Uhrzeit, Tagesleiste je Tisch und Seitenleiste mit allen
 * Reservierungen des gewählten Tisches. Zustände sind nie nur über Farbe
 * erkennbar – immer zusätzlich als Text auf dem Tisch und in der Legende.
 */

const STEP = 15;

/** Darstellung je Zustand (Farben aus dem Design-System). */
const LOOK: Record<TableState, { fill: string; stroke: string; width: number; dash?: string; text: string }> = {
  free: { fill: "#ffffff", stroke: "#b9bec6", width: 1.25, text: "#5b6472" },
  soon: { fill: "#ffffff", stroke: "#9c7a3c", width: 2.5, text: "#1d2433" },
  expected: { fill: "#e8eaee", stroke: "#1d2433", width: 2, text: "#1d2433" },
  late: { fill: "#f3e3e6", stroke: "#6b1e2e", width: 2.75, text: "#6b1e2e" },
  seated: { fill: "#dce8e0", stroke: "#3f6b4f", width: 2, text: "#24432f" },
  requested: { fill: "#f4eee2", stroke: "#9c7a3c", width: 2, dash: "5 3", text: "#5a4520" },
  turnover: { fill: "url(#live-hatch)", stroke: "#8a919c", width: 1.5, dash: "3 3", text: "#5b6472" },
};

/** Farbe der Abschnitte in der Tagesleiste je Reservierungsstatus. */
const STRIP: Record<string, string> = {
  PENDING_PAYMENT: "#c9b285",
  REQUESTED: "#c9b285",
  CONFIRMED: "#1d2433",
  ARRIVED: "#3f6b4f",
  NO_SHOW: "#b98a94",
};

const STATES: TableState[] = ["free", "soon", "expected", "late", "seated", "requested", "turnover"];

function statusText(t: AdminT, status: string) {
  const key = `res.status.${status}`;
  return isAdminKey(key) ? t(key) : status;
}

function shortName(name: string | null, maxChars: number) {
  const n = (name ?? "–").trim();
  if (n.length <= maxChars) return n;
  // Nachname bevorzugen ("Anna Schneider" → "Schneider"), sonst abschneiden
  const last = n.split(/\s+/).at(-1) ?? n;
  return last.length <= maxChars ? last : `${n.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** Zwei Textzeilen unter dem Tischnamen, je nach Zustand. */
function tableLines(t: AdminT, snap: TableSnapshot, at: number, maxChars: number): [string, string] {
  const c = snap.current;
  const n = snap.next;
  const nameChars = Math.max(4, maxChars - 4); // Platz für " · 4"
  switch (snap.state) {
    case "seated":
      return [`${shortName(c!.guestName, nameChars)} · ${c!.partySize}`, t("live.t.until", { time: formatMin(c!.endMin) })];
    case "expected":
      return [`${shortName(c!.guestName, nameChars)} · ${c!.partySize}`, `${formatMin(c!.startMin)}–${formatMin(c!.endMin)}`];
    case "late":
      return [`${shortName(c!.guestName, nameChars)} · ${c!.partySize}`, t("live.t.late", { min: Math.round(at - c!.startMin) })];
    case "requested":
      return [`${shortName(c!.guestName, nameChars)} · ${c!.partySize}`, t("live.t.request", { time: formatMin(c!.startMin) })];
    case "turnover":
      return [t("live.t.freeFrom", { time: formatMin(c!.blockedMin) }), n ? `${formatMin(n.startMin)} ${shortName(n.guestName, maxChars - 6)}` : ""];
    case "soon":
      return [t("live.t.freeUntil", { time: formatMin(n!.startMin) }), `${shortName(n!.guestName, nameChars)} · ${n!.partySize}`];
    default:
      return [t("live.t.free"), n ? t("live.t.until", { time: formatMin(n.startMin) }) : ""];
  }
}

export function LivePlan({ slug, data, canEditPlan }: { slug: string; data: LivePlanData; canEditPlan: boolean }) {
  const { t } = useAdminT();
  const router = useRouter();
  const helpId = useId();
  const { fromMin, toMin } = data;
  const clampTime = (m: number) => Math.min(toMin - STEP, Math.max(fromMin, m));
  const nowInWindow = data.isToday && data.nowMin >= fromMin && data.nowMin < toMin;

  // Uhr des Browsers, jede Minute weitergestellt; Minuten des Tages relativ zum Serverzeitpunkt
  const [clock, setClock] = useState(() => Date.now());
  // "Live": Uhrzeit folgt der echten Zeit, bis jemand den Regler bewegt
  const [live, setLive] = useState(nowInWindow);
  const [manualAt, setManualAt] = useState(() => (nowInWindow ? data.nowMin : fromMin));
  const [selected, setSelected] = useState<string | null>(null);
  const aside = useRef<HTMLElement>(null);

  // Tablet/Handy: Seitenleiste steht unter dem Plan → nach Auswahl dorthin scrollen
  useEffect(() => {
    if (!selected || window.matchMedia("(min-width: 1280px)").matches) return;
    aside.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);

  const nowMin = data.nowMin + Math.max(0, clock - data.nowEpoch) / 60_000;
  const at = live ? clampTime(Math.floor(nowMin)) : manualAt;

  // Jede Minute: Uhr weiterstellen und Daten neu laden (neue Buchungen, Statuswechsel)
  useEffect(() => {
    if (!data.isToday) return;
    const id = window.setInterval(() => {
      setClock(Date.now());
      router.refresh();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [data.isToday, router]);

  const byTable = useMemo(() => {
    const map = new Map<string, LiveReservation[]>();
    for (const r of data.reservations) for (const id of r.tableIds) map.set(id, [...(map.get(id) ?? []), r]);
    return map;
  }, [data.reservations]);

  const snapshots = useMemo(() => new Map(data.tables.map((tb) => [tb.id, tableSnapshot(byTable.get(tb.id) ?? [], at)])), [data.tables, byTable, at]);
  const curve = useMemo(() => occupancyCurve(data.reservations, fromMin, toMin, STEP), [data.reservations, fromMin, toMin]);
  // Zuschnitt auf den genutzten Bereich (inkl. Stühle und Tagesleisten) – größere Darstellung als mit fester Leinwand
  const view = useMemo(() => {
    const boxes = [
      ...data.areas.map((a) => ({ x: a.x, y: a.y, width: a.width, height: a.height })),
      ...data.tables.map((tb) => {
        const b = rotatedBounds(tb);
        return { x: b.x - 24, y: b.y - 20, width: b.width + 48, height: b.height + 52 };
      }),
    ];
    if (!boxes.length) return { x: 0, y: 0, width: canvasSize([], []).width, height: canvasSize([], []).height };
    const x = Math.min(...boxes.map((b) => b.x)) - 12;
    const y = Math.min(...boxes.map((b) => b.y)) - 12;
    const width = Math.max(...boxes.map((b) => b.x + b.width)) + 12 - x;
    const height = Math.max(...boxes.map((b) => b.y + b.height)) + 12 - y;
    return { x, y, width, height };
  }, [data.areas, data.tables]);
  const tableName = (id: string) => data.tables.find((tb) => tb.id === id)?.name ?? "?";

  const counts = useMemo(() => {
    let free = 0;
    let busy = 0;
    let guests = 0;
    const seen = new Set<string>();
    for (const [, s] of snapshots) {
      if (s.state === "seated" || s.state === "expected" || s.state === "late" || s.state === "requested") {
        busy++;
        if (s.state === "seated" && s.current && !seen.has(s.current.id)) {
          seen.add(s.current.id);
          guests += s.current.partySize;
        }
      } else free++;
    }
    return { free, busy, guests };
  }, [snapshots]);

  const upcoming = data.reservations
    .filter((r) => ["CONFIRMED", "REQUESTED", "PENDING_PAYMENT"].includes(r.status) && r.startMin >= at && r.startMin <= at + SOON_WITHIN_MIN)
    .sort((a, b) => a.startMin - b.startMin);
  const overdue = data.reservations
    .filter((r) => r.status === "CONFIRMED" && at >= r.startMin + LATE_AFTER_MIN && at < r.endMin)
    .sort((a, b) => a.startMin - b.startMin);

  const setTime = (m: number) => {
    setLive(false);
    setManualAt(clampTime(m));
  };
  const goLive = () => {
    setLive(true);
    setClock(Date.now());
    router.refresh();
  };

  const peak = curve.reduce((best, c) => (c.tables > best.tables ? c : best), { min: fromMin, tables: 0, guests: 0 });
  const totalTables = Math.max(1, data.tables.length);
  const selectedTable = data.tables.find((tb) => tb.id === selected) ?? null;
  const selectedRes = selectedTable ? [...(byTable.get(selectedTable.id) ?? [])].sort((a, b) => a.startMin - b.startMin) : [];
  const selectedSnap = selectedTable ? snapshots.get(selectedTable.id) : undefined;

  const onTableKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected((s) => (s === id ? null : id));
    } else if (e.key === "Escape") setSelected(null);
  };

  if (data.tables.length === 0) {
    return <p className="rounded-md border bg-card px-4 py-6 text-sm text-muted-foreground">{t("live.noTables")}</p>;
  }

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-3">
        {/* Zeitsteuerung mit Auslastungskurve */}
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" size="sm" variant={live ? "default" : "outline"} onClick={goLive} aria-pressed={live} disabled={!data.isToday}>
              <Radio className={cn("size-3.5", live && "animate-pulse")} aria-hidden />
              {live ? t("live.live") : t("live.now")}
            </Button>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => setTime(at - STEP)} aria-label={t("live.earlier")} disabled={at <= fromMin}>
                <ChevronLeft />
              </Button>
              <output className="w-16 text-center font-serif text-2xl tabular-nums" aria-live="polite">
                {formatMin(at)}
              </output>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => setTime(at + STEP)} aria-label={t("live.later")} disabled={at >= toMin - STEP}>
                <ChevronRight />
              </Button>
            </div>
            <dl className="ml-auto flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">{t("live.summary.free")}</dt>
                <dd className="font-medium tabular-nums">{counts.free}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">{t("live.summary.busy")}</dt>
                <dd className="font-medium tabular-nums">{counts.busy}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-muted-foreground">{t("live.summary.guests")}</dt>
                <dd className="font-medium tabular-nums">{counts.guests}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-3">
            {/* Kurve: Anteil belegter Tische je Viertelstunde; Klick springt zur Uhrzeit */}
            <div className="flex h-10 items-end gap-px" aria-hidden>
              {curve.map((c) => (
                <button
                  key={c.min}
                  type="button"
                  tabIndex={-1}
                  onClick={() => setTime(c.min)}
                  title={`${formatMin(c.min)} · ${c.tables}/${totalTables}`}
                  className={cn("flex-1 rounded-t-sm transition-colors", c.min <= at && at < c.min + STEP ? "bg-bordeaux" : "bg-[#1d2433]/25 hover:bg-[#1d2433]/45")}
                  style={{ height: `${Math.max(4, (c.tables / totalTables) * 100)}%` }}
                />
              ))}
            </div>
            <input
              type="range"
              min={fromMin}
              max={toMin - STEP}
              step={STEP}
              value={at}
              onChange={(e) => setTime(Number(e.target.value))}
              aria-label={t("live.time")}
              aria-valuetext={formatMin(at)}
              aria-describedby={helpId}
              className="mt-1 w-full accent-[#6b1e2e]"
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums" aria-hidden>
              {Array.from({ length: Math.floor((toMin - fromMin) / 60) + 1 }, (_, i) => fromMin + i * 60)
                .filter((_, i, all) => all.length <= 13 || i % 2 === 0)
                .map((m) => (
                  <span key={m}>{formatMin(m)}</span>
                ))}
            </div>
            <p id={helpId} className="sr-only">
              {t("live.curveHint", { tables: peak.tables, total: totalTables, time: formatMin(peak.min) })}
            </p>
          </div>
        </div>

        {/* Raumplan */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <svg
            viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
            className="block h-auto max-h-[78vh] w-full min-w-[720px] font-sans"
            role="group"
            aria-label={t("live.plan", { time: formatMin(at) })}
            onClick={() => setSelected(null)}
          >
            <defs>
              <pattern id="live-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="#f1f2f4" />
                <line x1="0" y1="0" x2="0" y2="8" stroke="#d4d7dc" strokeWidth="3" />
              </pattern>
            </defs>

            {data.areas.map((a) => (
              <g key={a.id} aria-hidden>
                <rect x={a.x} y={a.y} width={a.width} height={a.height} rx={4} fill={a.color ?? "#EEF0EC"} stroke="#dcdfe3" strokeWidth={1.5} />
                <text x={a.x + 12} y={a.y + 20} fontSize={14} fontWeight={500} fill="#5b6472">
                  {a.name}
                </text>
              </g>
            ))}

            {/* Verbindungslinien für kombinierte Tische */}
            {data.reservations
              .filter((r) => r.tableIds.length > 1)
              .filter((r) => r.tableIds.some((id) => snapshots.get(id)?.current?.id === r.id))
              .map((r) => {
                const centers = r.tableIds
                  .map((id) => data.tables.find((tb) => tb.id === id))
                  .filter((tb): tb is PlanTable => Boolean(tb))
                  .map(tableCenter);
                const look = LOOK[snapshots.get(r.tableIds[0])?.state ?? "expected"];
                return (
                  <polyline
                    key={`c-${r.id}`}
                    points={centers.map((c) => `${c.x},${c.y}`).join(" ")}
                    fill="none"
                    stroke={look.stroke}
                    strokeWidth={6}
                    strokeOpacity={0.35}
                    strokeLinecap="round"
                    aria-hidden
                  />
                );
              })}

            {data.tables.map((tb) => {
              const snap = snapshots.get(tb.id)!;
              const look = LOOK[snap.state];
              const isSelected = selected === tb.id;
              const bounds = rotatedBounds(tb);
              const c = tableCenter(tb);
              const maxChars = Math.max(6, Math.floor((bounds.width + 10) / 6.6));
              const [line1, line2] = tableLines(t, snap, at, maxChars);
              const stripW = Math.max(bounds.width, 96);
              const stripX = c.x - stripW / 2;
              const stripY = bounds.y + bounds.height + 16;
              const span = toMin - fromMin;
              const xOf = (m: number) => stripX + (Math.min(Math.max(m, fromMin), toMin) - fromMin) / span * stripW;
              const dayRes = byTable.get(tb.id) ?? [];
              const label = t("live.aria.table", {
                name: tb.name,
                state: t(`live.state.${snap.state}`),
                detail: line1 && snap.state !== "free" ? `, ${line1}, ${line2}` : line2 ? `, ${line2}` : "",
              });
              return (
                <g
                  key={tb.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={label}
                  className="cursor-pointer outline-none [&:focus-visible_.live-focus]:visible"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected((s) => (s === tb.id ? null : tb.id));
                  }}
                  onKeyDown={(e) => onTableKey(e, tb.id)}
                >
                  <g transform={`translate(${tb.x} ${tb.y}) rotate(${tb.rotation} ${tb.width / 2} ${tb.height / 2})`}>
                    <rect className="live-focus invisible" x={-16} y={-16} width={tb.width + 32} height={tb.height + 32} rx={12} fill="none" stroke="#6b1e2e" strokeWidth={2} strokeDasharray="5 4" />
                    {seatPositions(tb).map((s, i) => (
                      <circle key={i} cx={s.x} cy={s.y} r={6} fill={snap.state === "seated" ? "#9fbca9" : "#dcdfe3"} stroke="#8a919c" strokeWidth={0.6} />
                    ))}
                    {tb.shape === "ROUND" ? (
                      <ellipse cx={tb.width / 2} cy={tb.height / 2} rx={tb.width / 2} ry={tb.height / 2} fill={look.fill} stroke={isSelected ? "#6b1e2e" : look.stroke} strokeWidth={isSelected ? 3.5 : look.width} strokeDasharray={look.dash} />
                    ) : (
                      <rect width={tb.width} height={tb.height} rx={7} fill={look.fill} stroke={isSelected ? "#6b1e2e" : look.stroke} strokeWidth={isSelected ? 3.5 : look.width} strokeDasharray={look.dash} />
                    )}
                  </g>
                  {snap.state === "late" ? (
                    <g transform={`translate(${bounds.x + bounds.width - 4} ${bounds.y + 4})`} aria-hidden>
                      <circle r={9} fill="#6b1e2e" />
                      <text textAnchor="middle" dy="0.35em" fontSize={12} fontWeight={700} fill="#fff">
                        !
                      </text>
                    </g>
                  ) : null}
                  <text x={c.x} y={c.y} textAnchor="middle" className="pointer-events-none select-none" fill={look.text} aria-hidden>
                    <tspan x={c.x} dy={line2 ? "-0.8em" : "-0.25em"} fontSize={15} fontWeight={700}>
                      {tb.name}
                    </tspan>
                    <tspan x={c.x} dy="1.3em" fontSize={12}>
                      {line1}
                    </tspan>
                    {line2 ? (
                      <tspan x={c.x} dy="1.25em" fontSize={12} fontWeight={snap.state === "late" ? 700 : 400}>
                        {line2}
                      </tspan>
                    ) : null}
                  </text>

                  {/* Tagesleiste: alle Reservierungen des Tisches, Markierung = gewählte Uhrzeit */}
                  <g aria-hidden className="pointer-events-none">
                    <rect x={stripX} y={stripY} width={stripW} height={7} rx={3.5} fill="#eceeec" stroke="#dcdfe3" strokeWidth={0.5} />
                    {dayRes.map((r) => (
                      <rect
                        key={r.id}
                        x={xOf(r.startMin)}
                        y={stripY}
                        width={Math.max(2, xOf(r.endMin) - xOf(r.startMin))}
                        height={7}
                        rx={2}
                        fill={STRIP[r.status] ?? "#1d2433"}
                        opacity={r.status === "NO_SHOW" ? 0.5 : 0.9}
                      />
                    ))}
                    <line x1={xOf(at)} x2={xOf(at)} y1={stripY - 3} y2={stripY + 10} stroke="#6b1e2e" strokeWidth={1.5} />
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legende: Zustände mit Text, nicht nur Farbe */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label={t("live.legend")}>
          {STATES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <svg width="18" height="12" aria-hidden>
                <rect x="1" y="1" width="16" height="10" rx="2.5" fill={s === "turnover" ? "#eceeec" : LOOK[s].fill} stroke={LOOK[s].stroke} strokeWidth={Math.min(2, LOOK[s].width)} strokeDasharray={LOOK[s].dash} />
              </svg>
              {t(`live.state.${s}`)}
            </span>
          ))}
          <span className="ml-auto">{data.isToday ? t("live.refreshed") : null}</span>
        </div>
        {data.autoLayout ? (
          <p className="text-sm text-muted-foreground">
            {t("live.autoLayout")} {canEditPlan ? <Link href={`/admin/${slug}/raumplan`} className="underline underline-offset-4">{t("live.editPlan")}</Link> : t("live.autoLayoutPro")}
          </p>
        ) : null}
      </div>

      {/* Seitenleiste */}
      <aside ref={aside} className="w-full shrink-0 scroll-mt-4 space-y-4 xl:sticky xl:top-4 xl:w-80" aria-label={selectedTable ? t("live.table", { name: selectedTable.name }) : t("live.next")}>
        {selectedTable ? (
          <section className="rounded-lg border bg-card">
            <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 className="font-medium">{t("live.table", { name: selectedTable.name })}</h2>
                <p className="text-xs text-muted-foreground">
                  {t("live.tableMeta", {
                    area: data.areas.find((a) => a.id === selectedTable.areaId)?.name ?? "",
                    min: selectedTable.minCapacity,
                    max: selectedTable.maxCapacity,
                  })}
                  {selectedSnap ? ` · ${t(`live.state.${selectedSnap.state}`)}` : ""}
                </p>
              </div>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => setSelected(null)} aria-label={t("live.closeTable")}>
                <X />
              </Button>
            </div>
            <div className="px-4 py-3">
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{data.isToday ? t("live.tableDay") : t("live.tableDayOther")}</h3>
              {selectedRes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("live.tableEmpty")}</p>
              ) : (
                <ul className="space-y-3">
                  {selectedRes.map((r) => (
                    <ReservationItem key={r.id} r={r} slug={slug} at={at} t={t} others={r.tableIds.filter((id) => id !== selectedTable.id).map(tableName)} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : (
          <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">{t("live.selectHint")}</p>
        )}

        {overdue.length ? (
          <section className="rounded-lg border border-bordeaux/40 bg-card">
            <h2 className="border-b px-4 py-2.5 text-sm font-medium text-bordeaux">
              {t("live.late")} ({overdue.length})
            </h2>
            <ul className="divide-y">
              {overdue.map((r) => (
                <QuickItem key={r.id} r={r} label={t("live.t.late", { min: Math.round(at - r.startMin) })} tables={r.tableIds.map(tableName).join(" + ")} onSelect={() => setSelected(r.tableIds[0])} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-medium">{t("live.next")}</h2>
          {upcoming.length ? (
            <ul className="divide-y">
              {upcoming.map((r) => (
                <QuickItem key={r.id} r={r} label={formatMin(r.startMin)} tables={r.tableIds.map(tableName).join(" + ")} onSelect={() => setSelected(r.tableIds[0])} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t("live.nextEmpty")}</p>
          )}
        </section>

        <p className="text-sm">
          <Link href={`/admin/${slug}/timeline?date=${data.date}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t("live.listView")}
          </Link>
        </p>
      </aside>
    </div>
  );
}

function QuickItem({ r, label, tables, onSelect }: { r: LiveReservation; label: string; tables: string; onSelect: () => void }) {
  return (
    <li>
      <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none">
        <span className="w-14 shrink-0 font-medium tabular-nums">{label}</span>
        <span className="min-w-0 flex-1 truncate">{r.guestName ?? "–"}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {r.partySize} · {tables}
        </span>
      </button>
    </li>
  );
}

function ReservationItem({ r, slug, at, t, others }: { r: LiveReservation; slug: string; at: number; t: AdminT; others: string[] }) {
  const active = r.startMin <= at && at < r.endMin;
  return (
    <li className={cn("rounded-md border px-3 py-2.5 text-sm", active ? "border-[#1d2433]/40 bg-muted/40" : "border-border")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium tabular-nums">
          {formatMin(r.startMin)}–{formatMin(r.endMin)}
        </span>
        <span className="text-xs text-muted-foreground">{statusText(t, r.status)}</span>
      </div>
      <p className="mt-0.5">
        {r.guestName ?? "–"} · {t("live.guests", { count: r.partySize })}
        {others.length ? <span className="text-muted-foreground"> · {t("live.combined", { tables: others.join(" + ") })}</span> : null}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{r.code}</span>
        {r.hasNotes ? (
          <span className="inline-flex items-center gap-1">
            <StickyNote className="size-3" aria-hidden /> {t("live.note")}
          </span>
        ) : null}
        {r.guestPhone ? (
          <a href={`tel:${r.guestPhone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline">
            <Phone className="size-3" aria-hidden /> {t("live.call")}
          </a>
        ) : null}
        <Link href={`/admin/${slug}/reservierungen/${r.id}`} className="underline-offset-4 hover:text-foreground hover:underline">
          {t("live.details")}
        </Link>
      </div>
      {r.allowed.length ? (
        <div className="mt-2">
          <StatusActions current={r.status} allowed={r.allowed} onChange={(to) => changeStatusAction(slug, r.id, to as never)} />
        </div>
      ) : null}
    </li>
  );
}

"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AdminT } from "@/i18n/admin";
import type { PlanArea, PlanTable } from "@/lib/floorplan";
import { cn } from "@/lib/utils";
import { evaluateMove, formatMin, type LiveReservation } from "@/lib/service-view";

/**
 * „Tisch wechseln“: Alternative zum Ziehen (auch per Tastatur bedienbar).
 * Zeigt für jeden Tisch, ob er im Zeitraum der Reservierung frei ist, ob ein
 * Tausch ginge, und erlaubt mehrere Tische (Kombination für große Gruppen).
 */
export function ChangeTableDialog({
  r,
  t,
  areas,
  tables,
  reservations,
  onApply,
}: {
  r: LiveReservation;
  t: AdminT;
  areas: PlanArea[];
  tables: PlanTable[];
  reservations: LiveReservation[];
  onApply: (toIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(r.tableIds);
  const groupId = useId();

  const rows = useMemo(
    () =>
      tables.map((tb) => {
        const v = evaluateMove(r, [tb.id], reservations, tables);
        const mine = r.tableIds.includes(tb.id);
        let status: string;
        let tone: "free" | "swap" | "busy" | "mine";
        if (mine) {
          status = t("live.change.current");
          tone = "mine";
        } else if (v.kind === "free") {
          status = t("live.change.free");
          tone = "free";
        } else if (v.kind === "swap") {
          status = t("live.change.swap", { name: v.other.guestName ?? "–", time: formatMin(v.other.startMin) });
          tone = "swap";
        } else {
          const c = v.kind === "blocked" ? v.conflicts[0] : null;
          status = c ? t("live.change.busy", { name: c.guestName ?? "–", time: formatMin(c.startMin) }) : "";
          tone = "busy";
        }
        return { tb, status, tone };
      }),
    [r, reservations, tables, t],
  );

  const seats = selected.reduce((s, id) => s + (tables.find((x) => x.id === id)?.maxCapacity ?? 0), 0);
  const verdict = evaluateMove(r, selected, reservations, tables);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(r.tableIds);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {t("live.change")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{t("live.change.title", { name: r.guestName ?? "–" })}</DialogTitle>
        <DialogDescription>{t("live.change.hint", { time: `${formatMin(r.startMin)}–${formatMin(r.endMin)}`, party: r.partySize })}</DialogDescription>
        <div className="space-y-4" role="group" aria-labelledby={groupId}>
          <span id={groupId} className="sr-only">
            {t("live.change")}
          </span>
          {areas.map((area) => {
            const own = rows.filter((x) => x.tb.areaId === area.id);
            if (!own.length) return null;
            return (
              <fieldset key={area.id}>
                <legend className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{area.name}</legend>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {own.map(({ tb, status, tone }) => {
                    const checked = selected.includes(tb.id);
                    const disabled = tone === "busy" && !checked;
                    return (
                      <li key={tb.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-ring",
                            checked ? "border-[#1d2433] bg-muted" : "hover:bg-muted/60",
                            disabled && "cursor-not-allowed opacity-60",
                          )}
                        >
                          <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={() => toggle(tb.id)} />
                          <span className="min-w-0">
                            <span className="font-medium">{tb.name}</span>{" "}
                            <span className="text-muted-foreground">· {t("live.change.seats", { count: tb.maxCapacity })}</span>
                            <span className={cn("block text-xs", tone === "free" ? "text-salbei" : tone === "swap" ? "text-[#6f5527]" : "text-muted-foreground")}>{status}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>
        <p className={cn("text-sm", seats < r.partySize ? "text-bordeaux" : "text-muted-foreground")} aria-live="polite">
          {t("live.change.selected", { seats, party: r.partySize })}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={selected.length === 0 || verdict.kind === "same" || verdict.kind === "blocked"}
            onClick={() => {
              setOpen(false);
              onApply(selected);
            }}
          >
            {t("live.change.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

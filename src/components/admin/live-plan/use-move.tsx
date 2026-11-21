"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { moveTablesAction } from "@/app/admin/[restaurant]/reservierungen/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import type { AdminT } from "@/i18n/admin";
import { evaluateMove, MOVABLE_STATUSES, type LiveReservation, type MoveVerdict } from "@/lib/service-view";

/**
 * Umsetzen von Reservierungen: Ziehen (Raum und Zeitleiste) und „Tisch wechseln“
 * nutzen dieselbe Ausführung – mit Rückfrage bei Tausch oder zu wenigen Plätzen
 * und „Rückgängig“ im Hinweis.
 */

interface Table {
  id: string;
  name: string;
  maxCapacity: number;
}

type Pending =
  | { kind: "capacity"; r: LiveReservation; toIds: string[]; seats: number; swapWith?: LiveReservation }
  | { kind: "swap"; r: LiveReservation; toIds: string[]; other: LiveReservation; overCapacity: boolean };

export function useMover({ slug, t, reservations, tables }: { slug: string; t: AdminT; reservations: LiveReservation[]; tables: Table[] }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, start] = useTransition();
  const names = useCallback((ids: string[]) => ids.map((id) => tables.find((x) => x.id === id)?.name ?? "?").join(" + "), [tables]);

  const run = useCallback(
    (r: LiveReservation, toIds: string[], opts: { swapWith?: LiveReservation; allowOverCapacity?: boolean } = {}) =>
      start(async () => {
        const result = await moveTablesAction(slug, r.id, toIds, { swapWithId: opts.swapWith?.id ?? null, allowOverCapacity: opts.allowOverCapacity });
        if (result.ok) {
          const from = r.tableIds;
          toast.success(result.message, {
            action: {
              label: t("live.move.undo"),
              // Rückgängig = zurück auf die alten Tische (bei Tausch wieder zurücktauschen)
              onClick: () =>
                start(async () => {
                  const undo = await moveTablesAction(slug, r.id, from, { swapWithId: opts.swapWith?.id ?? null, allowOverCapacity: true });
                  if (undo.ok) toast.success(t("live.move.undone"));
                  else toast.error(undo.error);
                }),
            },
          });
        } else if (result.code === "CAPACITY") {
          // Kann passieren, wenn sich die Daten seit dem Laden geändert haben
          setPending({ kind: "capacity", r, toIds, seats: toIds.reduce((s, id) => s + (tables.find((x) => x.id === id)?.maxCapacity ?? 0), 0), swapWith: opts.swapWith });
        } else {
          toast.error(result.error);
        }
      }),
    [slug, t, tables],
  );

  /** Einstieg für Ziehen und Dialog: prüft, fragt ggf. nach, führt aus. */
  const request = useCallback(
    (r: LiveReservation, toIds: string[], verdict?: MoveVerdict) => {
      const v = verdict ?? evaluateMove(r, toIds, reservations, tables);
      if (v.kind === "same") return;
      if (v.kind === "blocked") return void toast.error(t("common.err.tableTaken"));
      if (v.kind === "swap") return setPending({ kind: "swap", r, toIds, other: v.other, overCapacity: v.overCapacity || v.otherOverCapacity });
      if (v.overCapacity) return setPending({ kind: "capacity", r, toIds, seats: v.seats });
      run(r, toIds);
    },
    [reservations, tables, run, t],
  );

  const confirm = () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === "swap") run(p.r, p.toIds, { swapWith: p.other, allowOverCapacity: p.overCapacity });
    else run(p.r, p.toIds, { swapWith: p.swapWith, allowOverCapacity: true });
  };

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent>
        {pending?.kind === "swap" ? (
          <>
            <DialogTitle>{t("live.move.swapTitle")}</DialogTitle>
            <DialogDescription>
              {t("live.move.swapText", { a: pending.r.guestName ?? "–", to: names(pending.toIds), b: pending.other.guestName ?? "–", from: names(pending.r.tableIds) })}
              {pending.overCapacity ? ` ${t("common.err.capacity")}` : ""}
            </DialogDescription>
          </>
        ) : pending?.kind === "capacity" ? (
          <>
            <DialogTitle>{t("live.move.capTitle")}</DialogTitle>
            <DialogDescription>{t("live.move.capText", { tables: names(pending.toIds), seats: pending.seats, party: pending.r.partySize })}</DialogDescription>
          </>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPending(null)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {pending?.kind === "swap" ? t("live.move.confirmSwap") : t("live.move.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { request, dialog, busy };
}

// ─── Ziehen ────────────────────────────────────────────────────────────────

export interface DragState {
  r: LiveReservation;
  fromTableId: string;
  x: number;
  y: number;
  /** Tisch unter dem Zeiger (Element mit data-drop-table). */
  over: string | null;
  active: boolean;
}

const THRESHOLD = 6;

/**
 * Ziehen einer Reservierung auf einen Tisch. Ziele sind Elemente mit
 * `data-drop-table="<id>"` – im Raum die Tische, in der Zeitleiste die Zeilen.
 * Ein kurzer Klick ohne Bewegung bleibt ein Klick (Auswahl).
 */
export function useReservationDrag(onDrop: (r: LiveReservation, tableId: string) => void) {
  const [drag, setDragState] = useState<DragState | null>(null);
  // Spiegel des Zustands für die Fenster-Ereignisse (keine Seiteneffekte in State-Updatern)
  const current = useRef<DragState | null>(null);
  const setDrag = useCallback((next: DragState | null) => {
    current.current = next;
    setDragState(next);
  }, []);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const begin = useCallback((e: ReactPointerEvent, r: LiveReservation | null | undefined, fromTableId: string) => {
    if (e.button !== 0 || !r || !MOVABLE_STATUSES.includes(r.status)) return;
    origin.current = { x: e.clientX, y: e.clientY };
    setDrag({ r, fromTableId, x: e.clientX, y: e.clientY, over: null, active: false });
  }, [setDrag]);

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = current.current;
      const o = origin.current;
      if (!d || !o) return;
      const active = d.active || Math.hypot(e.clientX - o.x, e.clientY - o.y) > THRESHOLD;
      if (!active) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drop-table]");
      setDrag({ ...d, x: e.clientX, y: e.clientY, over: el?.getAttribute("data-drop-table") ?? null, active: true });
    };
    const up = () => {
      const d = current.current;
      origin.current = null;
      setDrag(null);
      if (d?.active) {
        // Nur den Klick unmittelbar nach dem Loslassen schlucken (folgt im selben Ereignisablauf)
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        if (d.over && d.over !== d.fromTableId) onDrop(d.r, d.over);
      }
    };
    const cancel = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", cancel);
    };
  }, [dragging, onDrop, setDrag]);

  /** Für onClick: true, wenn das Klick-Ereignis zum gerade beendeten Ziehen gehört. */
  const consumeClick = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return { drag: drag?.active ? drag : null, begin, consumeClick };
}

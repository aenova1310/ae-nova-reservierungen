"use client";

import { Grid3x3, Minus, Plus, Redo2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";
import { toast } from "sonner";
import { saveFloorplanAction } from "@/app/admin/[restaurant]/raumplan/actions";
import { Button } from "@/components/ui/button";
import {
  AREA_COLORS,
  GRID,
  PLAN_LIMITS,
  canvasSize,
  clamp,
  isUnplaced,
  normalizeRotation,
  sanitizeArea,
  snap,
  tableCenter,
  type PlanArea,
  type PlanTable,
} from "@/lib/floorplan";
import { historyReducer, initHistory } from "@/lib/history";
import { cn } from "@/lib/utils";
import { PlanInspector } from "./plan-inspector";
import { NEW_AREA_PREFIX, moveArea, reassignArea, updateArea, updateTable, type Plan, type Selection } from "./plan-ops";
import { AreaLabel, AreaShapeSvg, TableLabel, TableShapeSvg } from "./plan-shapes";

type Point = { x: number; y: number };
type Drag =
  | { kind: "move-table"; id: string; from: Plan; offset: Point }
  | { kind: "rotate-table"; id: string; from: Plan }
  | { kind: "resize-table"; id: string; from: Plan }
  | { kind: "move-area"; id: string; from: Plan; offset: Point }
  | { kind: "resize-area"; id: string; from: Plan };

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const ROTATE_STEP = 15;

function describeTable(t: PlanTable, areas: PlanArea[]) {
  const area = areas.find((a) => a.id === t.areaId)?.name ?? "ohne Bereich";
  return `Tisch ${t.name}, ${t.maxCapacity} Plätze, ${area}, Position ${Math.round(t.x)} / ${Math.round(t.y)}, Drehung ${t.rotation}°`;
}

export function FloorplanEditor({ slug, initial, version: initialVersion }: { slug: string; initial: Plan; version: string }) {
  const [history, dispatch] = useReducer(historyReducer<Plan>, initial, initHistory);
  const plan = history.present;
  const [saved, setSaved] = useState<Plan>(initial);
  const [version, setVersion] = useState(initialVersion);
  const [selection, setSelection] = useState<Selection>(null);
  const [snapOn, setSnapOn] = useState(true);
  /** "fit" = an die verfügbare Breite anpassen (Standard), sonst feste Stufe. */
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [viewportWidth, setViewportWidth] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [saving, startSaving] = useTransition();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const helpId = useId();
  const dirty = plan !== saved;

  const placed = plan.tables.filter((t) => !isUnplaced(t));
  const unplaced = plan.tables.filter(isUnplaced);
  const size = useMemo(() => canvasSize(plan.areas, plan.tables), [plan]);
  // Leinwand wächst beim Ziehen mit, schrumpft aber erst nach dem Loslassen (kein Springen)
  const [minSize, setMinSize] = useState(size);
  const canvas = { width: Math.max(size.width, minSize.width), height: Math.max(size.height, minSize.height) };
  // Während des Ziehens bleibt der Maßstab stehen, auch wenn die Leinwand wächst
  const fitBase = minSize.width > 0 ? minSize.width : size.width;
  const fitZoom = viewportWidth > 0 ? clamp(Math.floor(((viewportWidth - 2) / fitBase) * 20) / 20, 0.4, 1) : 1;
  const scale = zoom === "fit" ? fitZoom : zoom;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const commit = useCallback((update: (p: Plan) => Plan) => dispatch({ type: "commit", update }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  // Tastenkürzel für den ganzen Editor; Eingabefelder behalten ihr eigenes Rückgängig
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (saving) return;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, saving]);

  // Ungespeicherte Änderungen: Warnung beim Schließen und bei Links innerhalb der App
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest("a[href]");
      if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || link.getAttribute("target") === "_blank") return;
      if (!window.confirm("Der Raumplan hat ungespeicherte Änderungen. Seite trotzdem verlassen?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  // ─── Zeigerbedienung ─────────────────────────────────────────────────────

  const toPlan = (e: { clientX: number; clientY: number }): Point => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  /** Raster nur, wenn eingeschaltet und Alt nicht gedrückt ist (feines Ausrichten). */
  const grid = (v: number, e: { altKey: boolean }) => (snapOn && !e.altKey ? snap(v) : Math.round(v));

  const startDrag = (e: PointerEvent, next: Drag, select: Selection) => {
    e.stopPropagation(); // auch Rechtsklick soll die Auswahl nicht aufheben
    if (e.button !== 0 || saving) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = next;
    setMinSize(canvas);
    setSelection(select);
  };

  const onTablePointerDown = (e: PointerEvent, t: PlanTable) => {
    const p = toPlan(e);
    startDrag(e, { kind: "move-table", id: t.id, from: plan, offset: { x: p.x - t.x, y: p.y - t.y } }, { kind: "table", id: t.id });
  };
  const onAreaPointerDown = (e: PointerEvent, a: PlanArea) => {
    const p = toPlan(e);
    startDrag(e, { kind: "move-area", id: a.id, from: plan, offset: { x: p.x - a.x, y: p.y - a.y } }, { kind: "area", id: a.id });
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toPlan(e);
    let update: (plan: Plan) => Plan;
    switch (d.kind) {
      case "move-table":
        update = () => updateTable(d.from, d.id, (t) => ({ ...t, x: grid(p.x - d.offset.x, e), y: grid(p.y - d.offset.y, e) }));
        break;
      case "rotate-table":
        update = () =>
          updateTable(d.from, d.id, (t) => {
            const c = tableCenter(t);
            const deg = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90; // Griff sitzt oben
            return { ...t, rotation: snapOn && !e.altKey ? Math.round(deg / ROTATE_STEP) * ROTATE_STEP : deg };
          });
        break;
      case "resize-table":
        // Größe symmetrisch um die Mitte – funktioniert unabhängig von der Drehung
        update = () =>
          updateTable(d.from, d.id, (t) => {
            const c = tableCenter(t);
            const rad = (-t.rotation * Math.PI) / 180;
            const dx = p.x - c.x;
            const dy = p.y - c.y;
            const lx = Math.abs(dx * Math.cos(rad) - dy * Math.sin(rad));
            const ly = Math.abs(dx * Math.sin(rad) + dy * Math.cos(rad));
            const width = clamp(grid(lx * 2, e), PLAN_LIMITS.minTable, PLAN_LIMITS.maxTable);
            const height = t.shape === "RECT" ? clamp(grid(ly * 2, e), PLAN_LIMITS.minTable, PLAN_LIMITS.maxTable) : width;
            return { ...t, width, height, x: c.x - width / 2, y: c.y - height / 2 };
          });
        break;
      case "move-area":
        update = () => moveArea(d.from, d.id, Math.max(0, grid(p.x - d.offset.x, e)), Math.max(0, grid(p.y - d.offset.y, e)));
        break;
      case "resize-area":
        update = () => updateArea(d.from, d.id, (a) => ({ ...a, width: grid(p.x - a.x, e), height: grid(p.y - a.y, e) }));
        break;
    }
    dispatch({ type: "preview", update });
  };

  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.kind === "move-table") dispatch({ type: "preview", update: (p) => reassignArea(p, d.id) });
    dispatch({ type: "settle", from: d.from });
    setMinSize({ width: 0, height: 0 });
  };

  // ─── Tastaturbedienung ───────────────────────────────────────────────────

  const ARROWS: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

  const onTableKey = (e: KeyboardEvent, t: PlanTable) => {
    const step = e.shiftKey ? 1 : GRID;
    const dir = ARROWS[e.key];
    if (dir) {
      e.preventDefault();
      commit((p) => reassignArea(updateTable(p, t.id, (x) => ({ ...x, x: x.x + dir.x * step, y: x.y + dir.y * step })), t.id));
      setAnnounce(`${t.name}: Position ${Math.round(t.x + dir.x * step)} / ${Math.round(t.y + dir.y * step)}`);
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      const rotation = normalizeRotation(t.rotation + (e.shiftKey ? -ROTATE_STEP : ROTATE_STEP));
      commit((p) => updateTable(p, t.id, (x) => ({ ...x, rotation })));
      setAnnounce(`${t.name}: Drehung ${rotation}°`);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelection({ kind: "table", id: t.id });
    } else if (e.key === "Escape") {
      setSelection(null);
    }
  };

  const onAreaKey = (e: KeyboardEvent, a: PlanArea) => {
    const step = e.shiftKey ? 1 : GRID;
    const dir = ARROWS[e.key];
    if (dir) {
      e.preventDefault();
      const x = Math.max(0, a.x + dir.x * step);
      const y = Math.max(0, a.y + dir.y * step);
      commit((p) => moveArea(p, a.id, x, y));
      setAnnounce(`${a.name}: Position ${x} / ${y}`);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelection({ kind: "area", id: a.id });
    } else if (e.key === "Escape") {
      setSelection(null);
    }
  };

  // ─── Aktionen ────────────────────────────────────────────────────────────

  const addArea = () => {
    let n = plan.areas.length + 1;
    while (plan.areas.some((a) => a.name === `Bereich ${n}`)) n++;
    const id = `${NEW_AREA_PREFIX}${crypto.randomUUID()}`;
    const right = plan.areas.reduce((m, a) => Math.max(m, a.x + a.width), 0);
    const area: PlanArea = sanitizeArea({
      id,
      name: `Bereich ${n}`,
      x: snap(right + 40),
      y: 40,
      width: 400,
      height: 300,
      color: AREA_COLORS[plan.areas.length % AREA_COLORS.length],
    });
    commit((p) => ({ ...p, areas: [...p.areas, area] }));
    setSelection({ kind: "area", id });
    // Neuen Bereich ins Bild holen
    requestAnimationFrame(() => document.getElementById(`plan-area-${id}`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }));
  };

  const save = () => {
    startSaving(async () => {
      const result = await saveFloorplanAction(slug, {
        baseVersion: version,
        areas: plan.areas,
        tables: plan.tables.map(({ id, areaId, x, y, width, height, rotation, shape }) => ({ id, areaId, x, y, width, height, rotation, shape })),
      });
      if (result?.ok && result.plan) {
        const next = { areas: result.plan.areas, tables: result.plan.tables };
        // Verlauf leeren: alte Schritte enthalten temporäre Bereichs-IDs
        dispatch({ type: "reset", present: next });
        setSaved(next);
        setVersion(result.plan.version);
        setSelection((s) => (s?.kind === "area" && s.id.startsWith(NEW_AREA_PREFIX) ? null : s));
        toast.success(result.message ?? "Gespeichert.");
      } else if (result && !result.ok) {
        toast.error(result.error);
      }
    });
  };

  const discard = () => {
    if (!window.confirm("Alle ungespeicherten Änderungen verwerfen?")) return;
    dispatch({ type: "reset", present: saved });
    setSelection(null);
  };

  const zoomOut = ZOOMS.filter((z) => z < scale - 0.001).at(-1);
  const zoomIn = ZOOMS.find((z) => z > scale + 0.001);
  const selectedTable = selection?.kind === "table" ? plan.tables.find((t) => t.id === selection.id) : undefined;
  const selectedArea = selection?.kind === "area" ? plan.areas.find((a) => a.id === selection.id) : undefined;

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2" role="toolbar" aria-label="Raumplan bearbeiten">
          <Button type="button" variant="ghost" size="icon" onClick={undo} disabled={history.past.length === 0 || saving} aria-label="Rückgängig (Strg+Z)" title="Rückgängig (Strg+Z)">
            <Undo2 />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={redo} disabled={history.future.length === 0 || saving} aria-label="Wiederholen (Strg+Umschalt+Z)" title="Wiederholen (Strg+Umschalt+Z)">
            <Redo2 />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button type="button" variant="ghost" size="icon" onClick={() => zoomOut && setZoom(zoomOut)} disabled={!zoomOut} aria-label="Verkleinern">
            <Minus />
          </Button>
          <button
            type="button"
            className="w-12 text-center text-sm tabular-nums text-muted-foreground hover:text-foreground"
            onClick={() => setZoom(zoom === "fit" ? 1 : "fit")}
            aria-label={`Zoom ${Math.round(scale * 100)} %, ${zoom === "fit" ? "auf 100 % stellen" : "an Breite anpassen"}`}
            title={zoom === "fit" ? "Auf 100 % stellen" : "An Breite anpassen"}
          >
            {Math.round(scale * 100)} %
          </button>
          <Button type="button" variant="ghost" size="icon" onClick={() => zoomIn && setZoom(zoomIn)} disabled={!zoomIn} aria-label="Vergrößern">
            <Plus />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button type="button" variant={snapOn ? "secondary" : "ghost"} size="sm" onClick={() => setSnapOn((v) => !v)} aria-pressed={snapOn}>
            <Grid3x3 /> Raster
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addArea} disabled={saving}>
            <Plus /> Bereich
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {dirty ? (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="size-2 rounded-full bg-messing" aria-hidden />
                Ungespeichert
              </span>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={!dirty || saving}>
              Verwerfen
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={!dirty || saving} aria-busy={saving}>
              {saving ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </div>

        {/* Während des Speicherns gesperrt: Änderungen in dieser Zeit gingen beim Übernehmen des Ergebnisses verloren */}
        <div ref={scroller} inert={saving} aria-busy={saving} className={cn("max-h-[70vh] overflow-auto bg-[var(--nova-porzellan)]", saving && "opacity-70")}>
          <svg
            ref={svgRef}
            width={canvas.width * scale}
            height={canvas.height * scale}
            viewBox={`0 0 ${canvas.width} ${canvas.height}`}
            role="group"
            aria-label={`Raumplan mit ${plan.areas.length} Bereichen und ${placed.length} Tischen`}
            aria-describedby={helpId}
            className="block font-sans"
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerDown={() => setSelection(null)}
          >
            <defs>
              <pattern id="plan-grid" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`} fill="none" stroke="var(--nova-linie)" strokeWidth={0.75} />
              </pattern>
            </defs>
            <rect width={canvas.width} height={canvas.height} fill={snapOn ? "url(#plan-grid)" : "none"} />

            {plan.areas.map((a) => {
              const selected = selection?.kind === "area" && selection.id === a.id;
              return (
                <g
                  key={a.id}
                  id={`plan-area-${a.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Bereich ${a.name}, Position ${a.x} / ${a.y}, ${a.width} × ${a.height}`}
                  aria-pressed={selected}
                  aria-describedby={helpId}
                  className="cursor-move outline-none [&:focus-visible>rect:first-child]:stroke-[var(--nova-bordeaux)] [&:focus-visible>rect:first-child]:[stroke-width:3]"
                  style={{ touchAction: "none" }}
                  onPointerDown={(e) => onAreaPointerDown(e, a)}
                  onKeyDown={(e) => onAreaKey(e, a)}
                >
                  <AreaShapeSvg area={a} selected={selected} />
                </g>
              );
            })}

            {placed.map((t) => {
              const selected = selection?.kind === "table" && selection.id === t.id;
              return (
                <g
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  aria-label={describeTable(t, plan.areas)}
                  aria-pressed={selected}
                  aria-describedby={helpId}
                  className="cursor-grab outline-none active:cursor-grabbing [&:focus-visible_.focus-ring]:visible"
                  style={{ touchAction: "none" }}
                  onPointerDown={(e) => onTablePointerDown(e, t)}
                  onKeyDown={(e) => onTableKey(e, t)}
                >
                  <g transform={`translate(${t.x} ${t.y}) rotate(${t.rotation} ${t.width / 2} ${t.height / 2})`}>
                    <rect className="focus-ring invisible" x={-14} y={-14} width={t.width + 28} height={t.height + 28} rx={10} fill="none" stroke="var(--nova-bordeaux)" strokeWidth={2} strokeDasharray="5 4" />
                    <TableShapeSvg table={t} selected={selected} />
                  </g>
                  <TableLabel table={t} />
                </g>
              );
            })}

            {/* Bereichsnamen über den Tischen, damit Stühle sie nicht verdecken */}
            {plan.areas.map((a) => (
              <AreaLabel key={a.id} area={a} />
            ))}

            {/* Griffe für die Auswahl (oberhalb aller Tische, damit sie greifbar bleiben) */}
            {selectedTable && !isUnplaced(selectedTable) ? (
              <g transform={`translate(${selectedTable.x} ${selectedTable.y}) rotate(${selectedTable.rotation} ${selectedTable.width / 2} ${selectedTable.height / 2})`}>
                <line x1={selectedTable.width / 2} y1={0} x2={selectedTable.width / 2} y2={-30} stroke="var(--nova-bordeaux)" strokeWidth={1.5} />
                <circle
                  cx={selectedTable.width / 2}
                  cy={-30}
                  r={8}
                  fill="#fff"
                  stroke="var(--nova-bordeaux)"
                  strokeWidth={2}
                  className="cursor-alias"
                  style={{ touchAction: "none" }}
                  onPointerDown={(e) => startDrag(e, { kind: "rotate-table", id: selectedTable.id, from: plan }, selection)}
                >
                  <title>Drehen (Taste R)</title>
                </circle>
                <rect
                  x={selectedTable.width - 6}
                  y={selectedTable.height - 6}
                  width={12}
                  height={12}
                  fill="var(--nova-bordeaux)"
                  className="cursor-nwse-resize"
                  style={{ touchAction: "none" }}
                  onPointerDown={(e) => startDrag(e, { kind: "resize-table", id: selectedTable.id, from: plan }, selection)}
                >
                  <title>Größe ändern</title>
                </rect>
              </g>
            ) : null}
            {selectedArea ? (
              <rect
                x={selectedArea.x + selectedArea.width - 7}
                y={selectedArea.y + selectedArea.height - 7}
                width={14}
                height={14}
                fill="var(--nova-bordeaux)"
                className="cursor-nwse-resize"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => startDrag(e, { kind: "resize-area", id: selectedArea.id, from: plan }, selection)}
              >
                <title>Bereichsgröße ändern</title>
              </rect>
            ) : null}
          </svg>
        </div>
        <p id={helpId} className="border-t px-3 py-2 text-xs text-muted-foreground">
          Ziehen zum Verschieben · runder Griff dreht, eckiger Griff ändert die Größe · Alt beim Ziehen: ohne Raster. Tastatur: Tab wählt
          Tisch oder Bereich, Pfeiltasten verschieben (mit Umschalt: fein), R dreht um {ROTATE_STEP}°.
        </p>
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>

      <PlanInspector
        disabled={saving}
        plan={plan}
        table={selectedTable}
        area={selectedArea}
        unplaced={unplaced}
        commit={commit}
        onSelect={setSelection}
        isNewArea={(id) => id.startsWith(NEW_AREA_PREFIX)}
        rotateStep={ROTATE_STEP}
      />
    </div>
  );
}

"use client";

import { RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AREA_COLORS, normalizeRotation, tableCenter, type PlanArea, type PlanTable, type TableShape } from "@/lib/floorplan";
import { cn } from "@/lib/utils";
import { placeTable, updateArea, updateTable, type Plan, type Selection } from "./plan-ops";

/**
 * Seitenleiste des Raumplans: Eigenschaften der Auswahl als Formularfelder.
 * Zugleich die Alternative zum Ziehen (WCAG 2.5.7) – alles lässt sich auch
 * per Zahleneingabe einstellen.
 */
interface Props {
  plan: Plan;
  table?: PlanTable;
  area?: PlanArea;
  unplaced: PlanTable[];
  commit: (update: (p: Plan) => Plan) => void;
  onSelect: (s: Selection) => void;
  isNewArea: (id: string) => boolean;
  rotateStep: number;
}

const SHAPES: { value: TableShape; label: string }[] = [
  { value: "RECT", label: "Rechteckig" },
  { value: "SQUARE", label: "Quadratisch" },
  { value: "ROUND", label: "Rund" },
];

const setTable = (id: string, fn: (t: PlanTable) => PlanTable) => (p: Plan) => updateTable(p, id, fn);
const setArea = (id: string, fn: (a: PlanArea) => PlanArea) => (p: Plan) => updateArea(p, id, fn);

/** Zahlenfeld, das erst beim Verlassen oder mit Enter übernimmt (ein Verlaufsschritt je Eingabe). */
type NumberFieldProps = { label: string; value: number; onCommit: (v: number) => void; suffix?: string };

// Neuer Wert von außen (Ziehen, Rückgängig) → Feld neu aufbauen statt Zustand nachzuführen
const NumberField = (props: NumberFieldProps) => <NumberInput key={Math.round(props.value)} {...props} />;

function NumberInput({ label, value, onCommit, suffix }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(Math.round(value)));
  const apply = () => {
    const n = Number(text.replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(n)) return setText(String(Math.round(value)));
    if (Math.round(n) !== Math.round(value)) onCommit(n);
  };
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
        {suffix ? ` (${suffix})` : ""}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        className="h-8 tabular-nums"
      />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-4 py-3 text-sm font-medium">{title}</h2>
      <div className="space-y-4 px-4 py-4">{children}</div>
    </section>
  );
}

function TablePanel({ table: t, plan, commit, rotateStep }: { table: PlanTable } & Pick<Props, "plan" | "commit" | "rotateStep">) {
  const areaSelect = useId();
  const update = (fn: (t: PlanTable) => PlanTable) => commit(setTable(t.id, fn));
  /** Größe ändern, Mitte bleibt stehen. */
  const resize = (width: number, height: number) =>
    update((x) => {
      const c = tableCenter(x);
      return { ...x, width, height, x: c.x - width / 2, y: c.y - height / 2 };
    });
  const area = plan.areas.find((a) => a.id === t.areaId);
  return (
    <Panel title={`Tisch ${t.name}`}>
      <p className="text-sm text-muted-foreground">
        {t.minCapacity === t.maxCapacity ? t.maxCapacity : `${t.minCapacity}–${t.maxCapacity}`} Personen{t.active ? "" : " · inaktiv"}
        <br />
        Name und Plätze ändern Sie unter „Tische &amp; Bereiche“.
      </p>

      <fieldset>
        <legend className="mb-1.5 text-xs text-muted-foreground">Form</legend>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          {SHAPES.map((s) => (
            <label
              key={s.value}
              className={cn(
                "cursor-pointer rounded px-2 py-1 text-center text-xs has-focus-visible:outline-2 has-focus-visible:outline-ring",
                t.shape === s.value ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input type="radio" name={`shape-${t.id}`} value={s.value} checked={t.shape === s.value} onChange={() => update((x) => ({ ...x, shape: s.value }))} className="sr-only" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {t.shape === "RECT" ? (
          <>
            <NumberField label="Breite" value={t.width} onCommit={(v) => resize(v, t.height)} />
            <NumberField label="Tiefe" value={t.height} onCommit={(v) => resize(t.width, v)} />
          </>
        ) : (
          <NumberField label={t.shape === "ROUND" ? "Durchmesser" : "Kantenlänge"} value={t.width} onCommit={(v) => resize(v, v)} />
        )}
        <NumberField label="Links" value={t.x} onCommit={(v) => update((x) => ({ ...x, x: v }))} />
        <NumberField label="Oben" value={t.y} onCommit={(v) => update((x) => ({ ...x, y: v }))} />
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <NumberField label="Drehung" suffix="Grad" value={t.rotation} onCommit={(v) => update((x) => ({ ...x, rotation: v }))} />
        </div>
        <Button type="button" variant="outline" size="icon" aria-label={`${rotateStep}° nach links drehen`} onClick={() => update((x) => ({ ...x, rotation: normalizeRotation(x.rotation - rotateStep) }))}>
          <RotateCcw />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label={`${rotateStep}° nach rechts drehen`} onClick={() => update((x) => ({ ...x, rotation: normalizeRotation(x.rotation + rotateStep) }))}>
          <RotateCw />
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor={areaSelect} className="text-xs text-muted-foreground">
          Bereich
        </Label>
        <select
          id={areaSelect}
          value={t.areaId}
          onChange={(e) => commit((p) => placeTable(p, t.id, e.target.value))}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {plan.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {area ? "Beim Wechsel wird der Tisch in den neuen Bereich gelegt." : null} Wer einen Tisch in einen anderen Bereich zieht, ändert den
          Bereich ebenfalls.
        </p>
      </div>
    </Panel>
  );
}

function AreaNameField({ name: initial, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const id = useId();
  const [name, setName] = useState(initial);
  const apply = () => {
    const v = name.trim().slice(0, 60);
    if (!v) return setName(initial);
    if (v !== initial) onCommit(v);
  };
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Name
      </Label>
      <Input
        id={id}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        className="h-8"
      />
    </div>
  );
}

function AreaPanel({ area: a, plan, commit, onSelect, isNewArea }: { area: PlanArea } & Pick<Props, "plan" | "commit" | "onSelect" | "isNewArea">) {
  const update = (fn: (a: PlanArea) => PlanArea) => commit(setArea(a.id, fn));
  const tableCount = plan.tables.filter((t) => t.areaId === a.id).length;
  return (
    <Panel title={`Bereich „${a.name}“`}>
      <AreaNameField key={a.name} name={a.name} onCommit={(name) => update((x) => ({ ...x, name }))} />
      <fieldset>
        <legend className="mb-1.5 text-xs text-muted-foreground">Flächenfarbe</legend>
        <div className="flex flex-wrap gap-2">
          {AREA_COLORS.map((c, i) => (
            <label key={c} className="cursor-pointer rounded-full has-checked:ring-2 has-checked:ring-bordeaux has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
              <input type="radio" name={`color-${a.id}`} checked={(a.color ?? AREA_COLORS[0]).toUpperCase() === c} onChange={() => update((x) => ({ ...x, color: c }))} className="sr-only" aria-label={`Farbe ${i + 1}`} />
              <span className="block size-7 rounded-full border" style={{ background: c }} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Breite" value={a.width} onCommit={(v) => update((x) => ({ ...x, width: v }))} />
        <NumberField label="Tiefe" value={a.height} onCommit={(v) => update((x) => ({ ...x, height: v }))} />
        <NumberField label="Links" value={a.x} onCommit={(v) => update((x) => ({ ...x, x: v }))} />
        <NumberField label="Oben" value={a.y} onCommit={(v) => update((x) => ({ ...x, y: v }))} />
      </div>
      <p className="text-sm text-muted-foreground">
        {tableCount === 1 ? "1 Tisch" : `${tableCount} Tische`}. Verschieben Sie den Bereich, wandern seine Tische mit.
      </p>
      {isNewArea(a.id) && tableCount === 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            commit((p) => ({ ...p, areas: p.areas.filter((x) => x.id !== a.id) }));
            onSelect(null);
          }}
        >
          <Trash2 /> Bereich entfernen
        </Button>
      ) : !isNewArea(a.id) ? (
        <p className="text-xs text-muted-foreground">Online-Buchbarkeit und Löschen: unter „Tische &amp; Bereiche“.</p>
      ) : null}
    </Panel>
  );
}

export function PlanInspector(props: Props) {
  const { plan, table, area, unplaced, commit, onSelect } = props;
  return (
    <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-80" aria-label="Eigenschaften">
      {table ? <TablePanel table={table} {...props} /> : null}
      {area ? <AreaPanel area={area} {...props} /> : null}
      {!table && !area ? (
        <Panel title="Auswahl">
          <p className="text-sm text-muted-foreground">
            Klicken Sie auf einen Tisch oder Bereich, um Form, Größe, Drehung und Position einzustellen. Der Plan wird erst mit „Speichern“
            übernommen.
          </p>
        </Panel>
      ) : null}

      {unplaced.length > 0 ? (
        <Panel title={`Noch nicht im Plan (${unplaced.length})`}>
          <ul className="space-y-1.5">
            {unplaced.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {t.name} <span className="text-muted-foreground">· {t.maxCapacity} P. · {plan.areas.find((a) => a.id === t.areaId)?.name}</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    commit((p) => placeTable(p, t.id));
                    onSelect({ kind: "table", id: t.id });
                  }}
                >
                  Platzieren
                </Button>
              </li>
            ))}
          </ul>
          {unplaced.length > 1 ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => commit((p) => unplaced.reduce((acc, t) => placeTable(acc, t.id), p))}>
              Alle platzieren
            </Button>
          ) : null}
        </Panel>
      ) : null}
    </aside>
  );
}

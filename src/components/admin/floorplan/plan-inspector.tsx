"use client";

import { RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminT } from "@/components/admin/i18n-provider";
import { AREA_COLORS, normalizeRotation, tableCenter, type PlanArea, type PlanTable, type TableShape } from "@/lib/floorplan";
import { cn } from "@/lib/utils";
import { placeTable, updateArea, updateTable, type Plan, type Selection } from "./plan-ops";

/**
 * Seitenleiste des Raumplans: Eigenschaften der Auswahl als Formularfelder.
 * Zugleich die Alternative zum Ziehen (WCAG 2.5.7) – alles lässt sich auch
 * per Zahleneingabe einstellen.
 */
interface Props {
  disabled: boolean;
  plan: Plan;
  table?: PlanTable;
  area?: PlanArea;
  unplaced: PlanTable[];
  commit: (update: (p: Plan) => Plan) => void;
  onSelect: (s: Selection) => void;
  isNewArea: (id: string) => boolean;
  rotateStep: number;
}

const SHAPES: TableShape[] = ["RECT", "SQUARE", "ROUND"];

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
    // Wird der Wert auf die Grenzen zurückgesetzt, ändert sich der Schlüssel nicht – Anzeige selbst angleichen
    setText(String(Math.round(value)));
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

function TablePanel({ table, plan, commit, rotateStep }: { table: PlanTable } & Pick<Props, "plan" | "commit" | "rotateStep">) {
  const { t } = useAdminT();
  const areaSelect = useId();
  const update = (fn: (x: PlanTable) => PlanTable) => commit(setTable(table.id, fn));
  /** Größe ändern, Mitte bleibt stehen. */
  const resize = (width: number, height: number) =>
    update((x) => {
      const c = tableCenter(x);
      return { ...x, width, height, x: c.x - width / 2, y: c.y - height / 2 };
    });
  const area = plan.areas.find((a) => a.id === table.areaId);
  return (
    <Panel title={t("fp.tableTitle", { name: table.name })}>
      <p className="text-sm text-muted-foreground">
        {t("fp.persons", { capacity: table.minCapacity === table.maxCapacity ? table.maxCapacity : `${table.minCapacity}–${table.maxCapacity}` })}
        {table.active ? "" : ` · ${t("fp.inactive")}`}
        <br />
        {t("fp.editTablesHint")}
      </p>

      <fieldset>
        <legend className="mb-1.5 text-xs text-muted-foreground">{t("fp.shape")}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          {SHAPES.map((s) => (
            <label
              key={s}
              className={cn(
                "cursor-pointer rounded px-2 py-1 text-center text-xs has-focus-visible:outline-2 has-focus-visible:outline-ring",
                table.shape === s ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input type="radio" name={`shape-${table.id}`} value={s} checked={table.shape === s} onChange={() =>
                  update((x) => {
                    // Gleiche Seiten bei quadratisch/rund: Mitte bleibt stehen
                    const side = s === "RECT" ? null : Math.max(x.width, x.height);
                    const c = tableCenter(x);
                    return side ? { ...x, shape: s, width: side, height: side, x: c.x - side / 2, y: c.y - side / 2 } : { ...x, shape: s };
                  })
                } className="sr-only" />
              {t(`fp.shape.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {table.shape === "RECT" ? (
          <>
            <NumberField label={t("fp.width")} value={table.width} onCommit={(v) => resize(v, table.height)} />
            <NumberField label={t("fp.depth")} value={table.height} onCommit={(v) => resize(table.width, v)} />
          </>
        ) : (
          <NumberField label={t(table.shape === "ROUND" ? "fp.diameter" : "fp.side")} value={table.width} onCommit={(v) => resize(v, v)} />
        )}
        <NumberField label={t("fp.left")} value={table.x} onCommit={(v) => update((x) => ({ ...x, x: v }))} />
        <NumberField label={t("fp.top")} value={table.y} onCommit={(v) => update((x) => ({ ...x, y: v }))} />
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <NumberField label={t("fp.rotation")} suffix={t("fp.degrees")} value={table.rotation} onCommit={(v) => update((x) => ({ ...x, rotation: v }))} />
        </div>
        <Button type="button" variant="outline" size="icon" aria-label={t("fp.rotateLeft", { step: rotateStep })} onClick={() => update((x) => ({ ...x, rotation: normalizeRotation(x.rotation - rotateStep) }))}>
          <RotateCcw />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label={t("fp.rotateRight", { step: rotateStep })} onClick={() => update((x) => ({ ...x, rotation: normalizeRotation(x.rotation + rotateStep) }))}>
          <RotateCw />
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor={areaSelect} className="text-xs text-muted-foreground">
          {t("fp.area")}
        </Label>
        <select
          id={areaSelect}
          value={table.areaId}
          onChange={(e) => commit((p) => placeTable(p, table.id, e.target.value))}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {plan.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {area ? t("fp.areaChangeHint") : null} {t("fp.areaDragHint")}
        </p>
      </div>
    </Panel>
  );
}

function AreaNameField({ name: initial, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const { t } = useAdminT();
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
        {t("fp.name")}
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
  const { t } = useAdminT();
  const update = (fn: (a: PlanArea) => PlanArea) => commit(setArea(a.id, fn));
  const tableCount = plan.tables.filter((x) => x.areaId === a.id).length;
  return (
    <Panel title={t("fp.areaTitle", { name: a.name })}>
      <AreaNameField key={a.name} name={a.name} onCommit={(name) => update((x) => ({ ...x, name }))} />
      <fieldset>
        <legend className="mb-1.5 text-xs text-muted-foreground">{t("fp.areaColor")}</legend>
        <div className="flex flex-wrap gap-2">
          {AREA_COLORS.map((c, i) => (
            <label key={c} className="cursor-pointer rounded-full has-checked:ring-2 has-checked:ring-bordeaux has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring">
              <input type="radio" name={`color-${a.id}`} checked={(a.color ?? AREA_COLORS[0]).toUpperCase() === c} onChange={() => update((x) => ({ ...x, color: c }))} className="sr-only" aria-label={t("fp.colorN", { n: i + 1 })} />
              <span className="block size-7 rounded-full border" style={{ background: c }} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label={t("fp.width")} value={a.width} onCommit={(v) => update((x) => ({ ...x, width: v }))} />
        <NumberField label={t("fp.depth")} value={a.height} onCommit={(v) => update((x) => ({ ...x, height: v }))} />
        <NumberField label={t("fp.left")} value={a.x} onCommit={(v) => update((x) => ({ ...x, x: v }))} />
        <NumberField label={t("fp.top")} value={a.y} onCommit={(v) => update((x) => ({ ...x, y: v }))} />
      </div>
      <p className="text-sm text-muted-foreground">
        {t("fp.tableCount", { count: tableCount })}. {t("fp.areaMoveHint")}
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
          <Trash2 /> {t("fp.removeArea")}
        </Button>
      ) : !isNewArea(a.id) ? (
        <p className="text-xs text-muted-foreground">{t("fp.areaManageHint")}</p>
      ) : null}
    </Panel>
  );
}

export function PlanInspector(props: Props) {
  const { plan, table, area, unplaced, commit, onSelect } = props;
  const { t } = useAdminT();
  return (
    <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-80" aria-label={t("fp.properties")} inert={props.disabled}>
      {table ? <TablePanel table={table} {...props} /> : null}
      {area ? <AreaPanel area={area} {...props} /> : null}
      {!table && !area ? (
        <Panel title={t("fp.selection")}>
          <p className="text-sm text-muted-foreground">
            {t("fp.selectionHint")}
          </p>
        </Panel>
      ) : null}

      {unplaced.length > 0 ? (
        <Panel title={t("fp.unplaced", { count: unplaced.length })}>
          <ul className="space-y-1.5">
            {unplaced.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {u.name}{" "}
                  <span className="text-muted-foreground">
                    · {t("fp.seatsShort", { capacity: u.maxCapacity })} · {plan.areas.find((a) => a.id === u.areaId)?.name}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    commit((p) => placeTable(p, u.id));
                    onSelect({ kind: "table", id: u.id });
                  }}
                >
                  {t("fp.place")}
                </Button>
              </li>
            ))}
          </ul>
          {unplaced.length > 1 ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => commit((p) => unplaced.reduce((acc, u) => placeTable(acc, u.id), p))}>
              {t("fp.placeAll")}
            </Button>
          ) : null}
        </Panel>
      ) : null}
    </aside>
  );
}

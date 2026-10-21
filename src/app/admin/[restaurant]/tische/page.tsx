import { Trash2 } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableMediaDialog } from "@/components/admin/table-media-dialog";
import { toMediaView, type TableMediaView } from "@/server/media/service";
import { hasFeature } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import {
  createCombinationAction,
  deleteAreaAction,
  deleteCombinationAction,
  deleteTableAction,
  saveAreaAction,
  saveTableAction,
  toggleCombinationAction,
} from "./actions";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
/** Gemeinsames Raster für Kopfzeile und Tischzeilen. */
const GRID = "grid grid-cols-[6rem_10rem_4.5rem_4.5rem_4rem_4rem_1fr] items-center gap-2";

export default async function TablesPage(props: PageProps<"/admin/[restaurant]/tische">) {
  const { restaurant: slug } = await props.params;
  const { tdb, restaurant } = await requireRestaurantAccess(slug);
  const tableView = hasFeature(restaurant.planCode, "tableView");
  const [areas, combos, mediaRows] = await Promise.all([
    tdb.area.findMany({ orderBy: { sortOrder: "asc" }, include: { tables: { orderBy: { sortOrder: "asc" } } } }),
    tdb.tableCombination.findMany({ orderBy: { name: "asc" }, include: { tables: { include: { table: { select: { name: true } } } } } }),
    tableView ? tdb.tableMedia.findMany() : Promise.resolve([]),
  ]);
  const mediaByTable = new Map<string, TableMediaView>(
    mediaRows.flatMap((m) => {
      const view = toMediaView(m);
      return view ? [[m.tableId, view] as const] : [];
    }),
  );
  const allTables = areas.flatMap((a) => a.tables.filter((t) => t.active));
  const seats = allTables.reduce((s, t) => s + t.maxCapacity, 0);

  return (
    <>
      <PageHeader
        title="Tische & Bereiche"
        description={`${allTables.length} aktive Tische · ${seats} Plätze · ${combos.length} Kombinationen`}
      />
      {!tableView ? (
        <p className="mb-6 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
          Mit Pro können Sie pro Tisch ein Foto oder 360°-Panorama hinterlegen – Gäste sehen bei der Tischwahl, wie sie sitzen.
        </p>
      ) : null}

      <div className="space-y-6">
        {areas.map((area) => (
          <Section
            key={area.id}
            title={area.name}
            description={area.onlineBookable ? "Online buchbar" : "Nur intern buchbar"}
          >
            <details className="mb-4">
              <summary className="cursor-pointer text-sm text-muted-foreground">Bereich bearbeiten</summary>
              <ActionForm action={saveAreaAction.bind(null, slug, area.id)} className="mt-3 flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`an-${area.id}`}>Name</Label>
                  <Input id={`an-${area.id}`} name="name" defaultValue={area.name} className="w-48" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ae-${area.id}`}>Name (Englisch)</Label>
                  <Input id={`ae-${area.id}`} name="nameEn" defaultValue={area.nameEn ?? ""} className="w-48" />
                </div>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <input type="checkbox" name="onlineBookable" defaultChecked={area.onlineBookable} /> Online buchbar
                </label>
                <SubmitButton variant="outline">Speichern</SubmitButton>
                <ConfirmAction
                  action={deleteAreaAction.bind(null, slug, area.id)}
                  title={`Bereich „${area.name}“ löschen?`}
                  description="Nur möglich, wenn keine Tische mehr im Bereich sind."
                  confirmLabel="Löschen"
                  destructive
                >
                  Bereich löschen
                </ConfirmAction>
              </ActionForm>
            </details>

            <div className="overflow-x-auto">
              <div className="min-w-[640px] space-y-1.5">
                {/* Sichtbare Spaltenköpfe; jedes Feld hat zusätzlich ein eigenes aria-label */}
                <div aria-hidden className={`${GRID} text-xs text-muted-foreground`}>
                  <span>Tisch</span>
                  <span>Bereich</span>
                  <span>Min.</span>
                  <span>Max.</span>
                  <span>Online</span>
                  <span>Aktiv</span>
                  <span />
                </div>
                {area.tables.map((t) => (
                  <div key={t.id} className={t.active ? "" : "text-muted-foreground"}>
                    <ActionForm action={saveTableAction.bind(null, slug, t.id)} className={GRID}>
                      <Input name="name" defaultValue={t.name} aria-label={`Name von Tisch ${t.name}`} className="h-8" />
                      <select name="areaId" defaultValue={t.areaId} aria-label="Bereich" className={`${selectClass} h-8`}>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <Input name="minCapacity" type="number" min={1} defaultValue={t.minCapacity} aria-label="Mindestbelegung" className="h-8" />
                      <Input name="maxCapacity" type="number" min={1} defaultValue={t.maxCapacity} aria-label="Höchstbelegung" className="h-8" />
                      <input type="checkbox" name="onlineBookable" defaultChecked={t.onlineBookable} aria-label="Online buchbar" className="size-4 justify-self-start" />
                      <input type="checkbox" name="active" defaultChecked={t.active} aria-label="Aktiv" className="size-4 justify-self-start" />
                      <div className="flex items-center justify-end gap-1">
                        {tableView ? <TableMediaDialog slug={slug} table={{ id: t.id, name: t.name }} media={mediaByTable.get(t.id) ?? null} /> : null}
                        <SubmitButton variant="ghost" size="sm">Speichern</SubmitButton>
                        <ConfirmAction
                          action={deleteTableAction.bind(null, slug, t.id)}
                          title={`Tisch ${t.name} löschen?`}
                          description="Tische mit Buchungshistorie werden nur deaktiviert."
                          confirmLabel="Löschen"
                          size="icon-sm"
                          destructive
                        >
                          <Trash2 aria-label="Löschen" />
                        </ConfirmAction>
                      </div>
                      <span className="col-span-7"><FieldError name="maxCapacity" /></span>
                    </ActionForm>
                  </div>
                ))}
              </div>
            </div>

            <ActionForm action={saveTableAction.bind(null, slug, null)} resetOnSuccess className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
              <input type="hidden" name="areaId" value={area.id} />
              <div className="space-y-1.5">
                <Label htmlFor={`nt-${area.id}`}>Neuer Tisch</Label>
                <Input id={`nt-${area.id}`} name="name" placeholder="z. B. 12" className="h-9 w-28" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`nmin-${area.id}`}>Min.</Label>
                <Input id={`nmin-${area.id}`} name="minCapacity" type="number" min={1} defaultValue={1} className="h-9 w-20" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`nmax-${area.id}`}>Max.</Label>
                <Input id={`nmax-${area.id}`} name="maxCapacity" type="number" min={1} defaultValue={2} className="h-9 w-20" />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" name="onlineBookable" defaultChecked /> Online buchbar
              </label>
              <SubmitButton variant="outline">Tisch hinzufügen</SubmitButton>
              <span className="w-full"><FieldError name="maxCapacity" /></span>
            </ActionForm>
          </Section>
        ))}

        <Section title="Neuer Bereich" description="Zum Beispiel Terrasse, Wintergarten oder Separee.">
          <ActionForm action={saveAreaAction.bind(null, slug, null)} resetOnSuccess className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="na-name">Name</Label>
              <Input id="na-name" name="name" required className="w-56" />
              <FieldError name="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="na-en">Name (Englisch)</Label>
              <Input id="na-en" name="nameEn" className="w-56" />
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="onlineBookable" defaultChecked /> Online buchbar
            </label>
            <SubmitButton variant="outline">Bereich anlegen</SubmitButton>
          </ActionForm>
        </Section>

        <Section
          title="Tischkombinationen"
          description="Tische, die für größere Gruppen zusammengestellt werden können. Die automatische Zuteilung nutzt Kombinationen erst, wenn kein Einzeltisch passt."
        >
          {combos.length ? (
            <ul className="mb-5 divide-y rounded-md border">
              {combos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium">{c.tables.map((x) => x.table.name).join(" + ")}</span>
                  <span className="text-muted-foreground">{c.minCapacity}–{c.maxCapacity} Personen</span>
                  {!c.active ? <Badge variant="secondary">Inaktiv</Badge> : null}
                  {c.active && !c.onlineBookable ? <Badge variant="secondary">Nur intern</Badge> : null}
                  <span className="ml-auto flex gap-1">
                    <ConfirmAction action={toggleCombinationAction.bind(null, slug, c.id, "onlineBookable")}>
                      {c.onlineBookable ? "Nur intern" : "Online freigeben"}
                    </ConfirmAction>
                    <ConfirmAction action={toggleCombinationAction.bind(null, slug, c.id, "active")}>
                      {c.active ? "Deaktivieren" : "Aktivieren"}
                    </ConfirmAction>
                    <ConfirmAction
                      action={deleteCombinationAction.bind(null, slug, c.id)}
                      title="Kombination löschen?"
                      confirmLabel="Löschen"
                      size="icon-sm"
                      destructive
                    >
                      <Trash2 aria-label="Löschen" />
                    </ConfirmAction>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <ActionForm action={createCombinationAction.bind(null, slug)} resetOnSuccess className="space-y-3">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Tische auswählen</legend>
              <div className="flex flex-wrap gap-2">
                {allTables.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary">
                    <input type="checkbox" name="tableIds" value={t.id} /> {t.name}
                  </label>
                ))}
              </div>
              <FieldError name="tableIds" />
            </fieldset>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-min">Min. Personen</Label>
                <Input id="c-min" name="minCapacity" type="number" min={1} defaultValue={5} className="h-9 w-24" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-max">Max. Personen</Label>
                <Input id="c-max" name="maxCapacity" type="number" min={1} defaultValue={8} className="h-9 w-24" />
              </div>
              <SubmitButton variant="outline">Kombination anlegen</SubmitButton>
            </div>
            <FieldError name="maxCapacity" />
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

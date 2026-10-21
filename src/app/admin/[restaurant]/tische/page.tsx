import { Trash2 } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableMediaDialog } from "@/components/admin/table-media-dialog";
import { toMediaView, type TableMediaView } from "@/server/media/service";
import { getAdminT } from "@/server/i18n";
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
  const { t } = await getAdminT();
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
  const allTables = areas.flatMap((a) => a.tables.filter((x) => x.active));
  const seats = allTables.reduce((s, x) => s + x.maxCapacity, 0);

  return (
    <>
      <PageHeader
        title={t("tables.title")}
        description={t("tables.summary", { tables: allTables.length, seats, combos: combos.length })}
      />
      {!tableView ? (
        <p className="mb-6 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("tables.proHint")}
        </p>
      ) : null}

      <div className="space-y-6">
        {areas.map((area) => (
          <Section
            key={area.id}
            title={area.name}
            description={area.onlineBookable ? t("tables.onlineBookable") : t("tables.internalBookable")}
          >
            <details className="mb-4">
              <summary className="cursor-pointer text-sm text-muted-foreground">{t("tables.editArea")}</summary>
              <ActionForm action={saveAreaAction.bind(null, slug, area.id)} className="mt-3 flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`an-${area.id}`}>{t("tables.name")}</Label>
                  <Input id={`an-${area.id}`} name="name" defaultValue={area.name} className="w-48" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`ae-${area.id}`}>{t("tables.nameEn")}</Label>
                  <Input id={`ae-${area.id}`} name="nameEn" defaultValue={area.nameEn ?? ""} className="w-48" />
                </div>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <input type="checkbox" name="onlineBookable" defaultChecked={area.onlineBookable} /> {t("tables.onlineBookable")}
                </label>
                <SubmitButton variant="outline">{t("common.save")}</SubmitButton>
                <ConfirmAction
                  action={deleteAreaAction.bind(null, slug, area.id)}
                  title={t("tables.deleteAreaTitle", { name: area.name })}
                  description={t("tables.deleteAreaDesc")}
                  confirmLabel={t("common.delete")}
                  destructive
                >
                  {t("tables.deleteArea")}
                </ConfirmAction>
              </ActionForm>
            </details>

            <div className="overflow-x-auto">
              <div className="min-w-[640px] space-y-1.5">
                {/* Sichtbare Spaltenköpfe; jedes Feld hat zusätzlich ein eigenes aria-label */}
                <div aria-hidden className={`${GRID} text-xs text-muted-foreground`}>
                  <span>{t("tables.col.table")}</span>
                  <span>{t("tables.col.area")}</span>
                  <span>{t("tables.col.min")}</span>
                  <span>{t("tables.col.max")}</span>
                  <span>{t("tables.col.online")}</span>
                  <span>{t("tables.col.active")}</span>
                  <span />
                </div>
                {area.tables.map((tb) => (
                  <div key={tb.id} className={tb.active ? "" : "text-muted-foreground"}>
                    <ActionForm action={saveTableAction.bind(null, slug, tb.id)} className={GRID}>
                      <Input name="name" defaultValue={tb.name} aria-label={t("tables.aria.tableName", { name: tb.name })} className="h-8" />
                      <select name="areaId" defaultValue={tb.areaId} aria-label={t("tables.col.area")} className={`${selectClass} h-8`}>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <Input name="minCapacity" type="number" min={1} defaultValue={tb.minCapacity} aria-label={t("tables.aria.minCapacity")} className="h-8" />
                      <Input name="maxCapacity" type="number" min={1} defaultValue={tb.maxCapacity} aria-label={t("tables.aria.maxCapacity")} className="h-8" />
                      <input type="checkbox" name="onlineBookable" defaultChecked={tb.onlineBookable} aria-label={t("tables.onlineBookable")} className="size-4 justify-self-start" />
                      <input type="checkbox" name="active" defaultChecked={tb.active} aria-label={t("tables.col.active")} className="size-4 justify-self-start" />
                      <div className="flex items-center justify-end gap-1">
                        {tableView ? <TableMediaDialog slug={slug} table={{ id: tb.id, name: tb.name }} media={mediaByTable.get(tb.id) ?? null} /> : null}
                        <SubmitButton variant="ghost" size="sm">{t("common.save")}</SubmitButton>
                        <ConfirmAction
                          action={deleteTableAction.bind(null, slug, tb.id)}
                          title={t("tables.deleteTableTitle", { name: tb.name })}
                          description={t("tables.deleteTableDesc")}
                          confirmLabel={t("common.delete")}
                          size="icon-sm"
                          destructive
                        >
                          <Trash2 aria-label={t("common.delete")} />
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
                <Label htmlFor={`nt-${area.id}`}>{t("tables.newTable")}</Label>
                <Input id={`nt-${area.id}`} name="name" placeholder={t("tables.newTablePlaceholder")} className="h-9 w-28" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`nmin-${area.id}`}>{t("tables.col.min")}</Label>
                <Input id={`nmin-${area.id}`} name="minCapacity" type="number" min={1} defaultValue={1} className="h-9 w-20" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`nmax-${area.id}`}>{t("tables.col.max")}</Label>
                <Input id={`nmax-${area.id}`} name="maxCapacity" type="number" min={1} defaultValue={2} className="h-9 w-20" />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" name="onlineBookable" defaultChecked /> {t("tables.onlineBookable")}
              </label>
              <SubmitButton variant="outline">{t("tables.addTable")}</SubmitButton>
              <span className="w-full"><FieldError name="maxCapacity" /></span>
            </ActionForm>
          </Section>
        ))}

        <Section title={t("tables.newArea")} description={t("tables.newAreaDesc")}>
          <ActionForm action={saveAreaAction.bind(null, slug, null)} resetOnSuccess className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="na-name">{t("tables.name")}</Label>
              <Input id="na-name" name="name" required className="w-56" />
              <FieldError name="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="na-en">{t("tables.nameEn")}</Label>
              <Input id="na-en" name="nameEn" className="w-56" />
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="onlineBookable" defaultChecked /> {t("tables.onlineBookable")}
            </label>
            <SubmitButton variant="outline">{t("tables.createArea")}</SubmitButton>
          </ActionForm>
        </Section>

        <Section
          title={t("tables.combos")}
          description={t("tables.combosDesc")}
        >
          {combos.length ? (
            <ul className="mb-5 divide-y rounded-md border">
              {combos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-medium">{c.tables.map((x) => x.table.name).join(" + ")}</span>
                  <span className="text-muted-foreground">{t("tables.comboPersons", { min: c.minCapacity, max: c.maxCapacity })}</span>
                  {!c.active ? <Badge variant="secondary">{t("tables.inactive")}</Badge> : null}
                  {c.active && !c.onlineBookable ? <Badge variant="secondary">{t("tables.internalOnly")}</Badge> : null}
                  <span className="ml-auto flex gap-1">
                    <ConfirmAction action={toggleCombinationAction.bind(null, slug, c.id, "onlineBookable")}>
                      {c.onlineBookable ? t("tables.internalOnly") : t("tables.releaseOnline")}
                    </ConfirmAction>
                    <ConfirmAction action={toggleCombinationAction.bind(null, slug, c.id, "active")}>
                      {c.active ? t("tables.deactivate") : t("tables.activate")}
                    </ConfirmAction>
                    <ConfirmAction
                      action={deleteCombinationAction.bind(null, slug, c.id)}
                      title={t("tables.deleteComboTitle")}
                      confirmLabel={t("common.delete")}
                      size="icon-sm"
                      destructive
                    >
                      <Trash2 aria-label={t("common.delete")} />
                    </ConfirmAction>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <ActionForm action={createCombinationAction.bind(null, slug)} resetOnSuccess className="space-y-3">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("tables.chooseTables")}</legend>
              <div className="flex flex-wrap gap-2">
                {allTables.map((tb) => (
                  <label key={tb.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary">
                    <input type="checkbox" name="tableIds" value={tb.id} /> {tb.name}
                  </label>
                ))}
              </div>
              <FieldError name="tableIds" />
            </fieldset>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="c-min">{t("tables.minPersons")}</Label>
                <Input id="c-min" name="minCapacity" type="number" min={1} defaultValue={5} className="h-9 w-24" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-max">{t("tables.maxPersons")}</Label>
                <Input id="c-max" name="maxCapacity" type="number" min={1} defaultValue={8} className="h-9 w-24" />
              </div>
              <SubmitButton variant="outline">{t("tables.createCombo")}</SubmitButton>
            </div>
            <FieldError name="maxCapacity" />
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

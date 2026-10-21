import { Trash2 } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { utcToLocalDate } from "@/server/availability/time";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import {
  copyWeekdayAction,
  deleteExceptionAction,
  deleteShiftAction,
  saveDurationRulesAction,
  saveExceptionAction,
  saveShiftAction,
} from "./actions";

const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export default async function OpeningHoursPage(props: PageProps<"/admin/[restaurant]/oeffnungszeiten">) {
  const { restaurant: slug } = await props.params;
  const { tdb, restaurant } = await requireRestaurantAccess(slug);
  const today = utcToLocalDate(new Date(), restaurant.timezone);
  const [shifts, exceptions, rules, settings] = await Promise.all([
    tdb.shift.findMany({ orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
    tdb.dateException.findMany({ where: { date: { gte: new Date(`${today}T00:00:00Z`) } }, orderBy: { date: "asc" } }),
    tdb.durationRule.findMany({ orderBy: { minPartySize: "asc" } }),
    tdb.restaurantSettings.findUnique({ where: { restaurantId: restaurant.id } }),
  ]);
  const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const ruleRows = [...rules, ...Array.from({ length: Math.max(1, 4 - rules.length) }, () => null)];

  return (
    <>
      <PageHeader
        title="Öffnungszeiten"
        description="Schichten bestimmen, wann online gebucht werden kann. Ein Wochentag ohne Schicht ist Ruhetag."
      />
      <div className="space-y-6">
        <Section title="Wochenplan" description={`Slot-Raster: alle ${settings?.slotIntervalMinutes ?? 15} Minuten (änderbar unter Einstellungen oder pro Schicht).`}>
          <div className="divide-y">
            {WEEKDAYS.map((label, i) => {
              const weekday = i + 1;
              const dayShifts = shifts.filter((s) => s.weekday === weekday);
              return (
                <div key={weekday} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[9rem_1fr]">
                  <div>
                    <p className="font-medium">{label}</p>
                    {dayShifts.length === 0 ? <Badge variant="secondary" className="mt-1">Ruhetag</Badge> : null}
                  </div>
                  <div className="space-y-2">
                    {dayShifts.map((s) => (
                      <ActionForm key={s.id} action={saveShiftAction.bind(null, slug, s.id)} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="weekday" value={weekday} />
                        <ShiftFields defaults={s} idPrefix={s.id} />
                        <SubmitButton variant="ghost" size="sm">Speichern</SubmitButton>
                        <ConfirmAction action={deleteShiftAction.bind(null, slug, s.id)} size="icon-sm">
                          <Trash2 aria-label={`Schicht ${s.name} löschen`} />
                        </ConfirmAction>
                      </ActionForm>
                    ))}
                    <details>
                      <summary className="cursor-pointer text-sm text-muted-foreground">Schicht hinzufügen</summary>
                      <ActionForm action={saveShiftAction.bind(null, slug, null)} resetOnSuccess className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="weekday" value={weekday} />
                        <ShiftFields idPrefix={`new-${weekday}`} defaults={{ name: dayShifts.length ? "Abend" : "Mittag", startTime: dayShifts.length ? "17:30" : "12:00", endTime: dayShifts.length ? "22:30" : "14:30", lastSeatingTime: null, slotIntervalMinutes: null }} />
                        <SubmitButton variant="outline" size="sm">Hinzufügen</SubmitButton>
                      </ActionForm>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
          <ActionForm action={copyWeekdayAction.bind(null, slug)} className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
            <span>Schichten von</span>
            <select name="from" className={selectClass} aria-label="Quelltag" defaultValue={2}>
              {WEEKDAYS.map((w, i) => (
                <option key={w} value={i + 1}>{w}</option>
              ))}
            </select>
            <span>übernehmen für</span>
            {WEEKDAYS.map((w, i) => (
              <label key={w} className="flex items-center gap-1">
                <input type="checkbox" name="to" value={i + 1} /> {w.slice(0, 2)}
              </label>
            ))}
            <SubmitButton variant="outline" size="sm">Kopieren</SubmitButton>
          </ActionForm>
        </Section>

        <Section title="Sonderschließungen & Sonderöffnungen" description="Feiertage, Betriebsferien oder abweichende Zeiten an einzelnen Tagen. Ersetzen die Schichten dieses Tages.">
          {exceptions.length ? (
            <ul className="mb-5 divide-y rounded-md border">
              {exceptions.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="tabular w-32">{dateFmt.format(e.date)}</span>
                  <Badge variant={e.type === "CLOSED" ? "destructive" : "secondary"}>{e.type === "CLOSED" ? "Geschlossen" : `${e.startTime}–${e.endTime}`}</Badge>
                  <span className="text-muted-foreground">{e.reason}</span>
                  <span className="ml-auto">
                    <ConfirmAction action={deleteExceptionAction.bind(null, slug, e.id)} size="icon-sm">
                      <Trash2 aria-label="Ausnahme löschen" />
                    </ConfirmAction>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">Keine bevorstehenden Ausnahmen.</p>
          )}
          <ActionForm action={saveExceptionAction.bind(null, slug)} resetOnSuccess className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ex-date">Datum</Label>
              <Input id="ex-date" name="date" type="date" min={today} required className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-type">Art</Label>
              <select id="ex-type" name="type" className={selectClass}>
                <option value="CLOSED">Geschlossen</option>
                <option value="SPECIAL_HOURS">Sonderöffnung</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-start">Von</Label>
              <Input id="ex-start" name="startTime" type="time" className="h-9 w-28" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-end">Bis</Label>
              <Input id="ex-end" name="endTime" type="time" className="h-9 w-28" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-last">Letzter Einlass</Label>
              <Input id="ex-last" name="lastSeatingTime" type="time" className="h-9 w-28" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-reason">Anlass</Label>
              <Input id="ex-reason" name="reason" placeholder="z. B. Betriebsferien" className="h-9 w-48" />
            </div>
            <SubmitButton variant="outline">Eintragen</SubmitButton>
            <span className="w-full"><FieldError name="startTime" /></span>
          </ActionForm>
        </Section>

        <Section title="Verweildauer" description="Wie lange ein Tisch je nach Personenzahl reserviert wird. Gilt für Online- und Telefonbuchungen.">
          <ActionForm action={saveDurationRulesAction.bind(null, slug)} className="space-y-3">
            <table className="text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pr-3 pb-2 font-medium">Personen von</th>
                  <th className="pr-3 pb-2 font-medium">bis</th>
                  <th className="pb-2 font-medium">Minuten</th>
                </tr>
              </thead>
              <tbody>
                {ruleRows.map((r, i) => (
                  <tr key={r?.id ?? `empty-${i}`}>
                    <td className="py-1 pr-3"><Input name="min" type="number" min={1} defaultValue={r?.minPartySize} aria-label="Personen von" className="h-8 w-24" /></td>
                    <td className="py-1 pr-3"><Input name="max" type="number" min={1} defaultValue={r?.maxPartySize} aria-label="Personen bis" className="h-8 w-24" /></td>
                    <td className="py-1"><Input name="duration" type="number" min={15} step={15} defaultValue={r?.durationMinutes} aria-label="Minuten" className="h-8 w-24" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dd">Sonst (Minuten)</Label>
                <Input id="dd" name="defaultDurationMinutes" type="number" min={15} step={15} defaultValue={settings?.defaultDurationMinutes ?? 120} className="h-9 w-28" />
              </div>
              <SubmitButton variant="outline">Verweildauer speichern</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

function ShiftFields({
  defaults,
  idPrefix,
}: {
  defaults: { name: string; startTime: string; endTime: string; lastSeatingTime: string | null; slotIntervalMinutes: number | null };
  idPrefix: string;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`} className="text-xs text-muted-foreground">Name</Label>
        <Input id={`${idPrefix}-name`} name="name" defaultValue={defaults.name} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-start`} className="text-xs text-muted-foreground">Erster Slot</Label>
        <Input id={`${idPrefix}-start`} name="startTime" type="time" defaultValue={defaults.startTime} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-last`} className="text-xs text-muted-foreground">Letzter Einlass</Label>
        <Input id={`${idPrefix}-last`} name="lastSeatingTime" type="time" defaultValue={defaults.lastSeatingTime ?? ""} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-end`} className="text-xs text-muted-foreground">Schichtende</Label>
        <Input id={`${idPrefix}-end`} name="endTime" type="time" defaultValue={defaults.endTime} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-int`} className="text-xs text-muted-foreground">Raster</Label>
        <Input id={`${idPrefix}-int`} name="slotIntervalMinutes" type="number" min={5} step={5} placeholder="Std." defaultValue={defaults.slotIntervalMinutes ?? ""} className="h-8 w-20" />
      </div>
    </>
  );
}

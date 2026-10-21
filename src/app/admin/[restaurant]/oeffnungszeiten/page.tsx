import { Trash2 } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminT } from "@/i18n/admin";
import { dateFormat } from "@/i18n/admin/format";
import { utcToLocalDate } from "@/server/availability/time";
import { getAdminT } from "@/server/i18n";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import {
  copyWeekdayAction,
  deleteExceptionAction,
  deleteShiftAction,
  saveDurationRulesAction,
  saveExceptionAction,
  saveShiftAction,
} from "./actions";

const selectClass = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export default async function OpeningHoursPage(props: PageProps<"/admin/[restaurant]/oeffnungszeiten">) {
  const { restaurant: slug } = await props.params;
  const { tdb, restaurant } = await requireRestaurantAccess(slug);
  const { t, locale } = await getAdminT();
  // Wochentagsnamen Montag … Sonntag (1. Januar 2024 war ein Montag)
  const weekdayFmt = dateFormat(locale, { weekday: "long", timeZone: "UTC" });
  const WEEKDAYS = Array.from({ length: 7 }, (_, i) => weekdayFmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
  const today = utcToLocalDate(new Date(), restaurant.timezone);
  const [shifts, exceptions, rules, settings] = await Promise.all([
    tdb.shift.findMany({ orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
    tdb.dateException.findMany({ where: { date: { gte: new Date(`${today}T00:00:00Z`) } }, orderBy: { date: "asc" } }),
    tdb.durationRule.findMany({ orderBy: { minPartySize: "asc" } }),
    tdb.restaurantSettings.findUnique({ where: { restaurantId: restaurant.id } }),
  ]);
  const dateFmt = dateFormat(locale, { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const ruleRows = [...rules, ...Array.from({ length: Math.max(1, 4 - rules.length) }, () => null)];

  return (
    <>
      <PageHeader
        title={t("hours.title")}
        description={t("hours.desc")}
      />
      <div className="space-y-6">
        <Section title={t("hours.week")} description={t("hours.weekDesc", { minutes: settings?.slotIntervalMinutes ?? 15 })}>
          <div className="divide-y">
            {WEEKDAYS.map((label, i) => {
              const weekday = i + 1;
              const dayShifts = shifts.filter((s) => s.weekday === weekday);
              return (
                <div key={weekday} className="grid gap-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[9rem_1fr]">
                  <div>
                    <p className="font-medium">{label}</p>
                    {dayShifts.length === 0 ? <Badge variant="secondary" className="mt-1">{t("hours.closedDay")}</Badge> : null}
                  </div>
                  <div className="space-y-2">
                    {dayShifts.map((s) => (
                      <ActionForm key={s.id} action={saveShiftAction.bind(null, slug, s.id)} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="weekday" value={weekday} />
                        <ShiftFields t={t} defaults={s} idPrefix={s.id} />
                        <SubmitButton variant="ghost" size="sm">{t("common.save")}</SubmitButton>
                        <ConfirmAction action={deleteShiftAction.bind(null, slug, s.id)} size="icon-sm">
                          <Trash2 aria-label={t("hours.deleteShift", { name: s.name })} />
                        </ConfirmAction>
                      </ActionForm>
                    ))}
                    <details>
                      <summary className="cursor-pointer text-sm text-muted-foreground">{t("hours.addShift")}</summary>
                      <ActionForm action={saveShiftAction.bind(null, slug, null)} resetOnSuccess className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="weekday" value={weekday} />
                        <ShiftFields t={t} idPrefix={`new-${weekday}`} defaults={{ name: dayShifts.length ? t("hours.defaultDinner") : t("hours.defaultLunch"), startTime: dayShifts.length ? "17:30" : "12:00", endTime: dayShifts.length ? "22:30" : "14:30", lastSeatingTime: null, slotIntervalMinutes: null }} />
                        <SubmitButton variant="outline" size="sm">{t("hours.add")}</SubmitButton>
                      </ActionForm>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
          <ActionForm action={copyWeekdayAction.bind(null, slug)} className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
            <span>{t("hours.copyFrom")}</span>
            <select name="from" className={selectClass} aria-label={t("hours.sourceDay")} defaultValue={2}>
              {WEEKDAYS.map((w, i) => (
                <option key={w} value={i + 1}>{w}</option>
              ))}
            </select>
            <span>{t("hours.copyTo")}</span>
            {WEEKDAYS.map((w, i) => (
              <label key={w} className="flex items-center gap-1">
                <input type="checkbox" name="to" value={i + 1} /> {w.slice(0, 2)}
              </label>
            ))}
            <SubmitButton variant="outline" size="sm">{t("hours.copy")}</SubmitButton>
          </ActionForm>
        </Section>

        <Section title={t("hours.exceptions")} description={t("hours.exceptionsDesc")}>
          {exceptions.length ? (
            <ul className="mb-5 divide-y rounded-md border">
              {exceptions.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  <span className="tabular w-32">{dateFmt.format(e.date)}</span>
                  <Badge variant={e.type === "CLOSED" ? "destructive" : "secondary"}>{e.type === "CLOSED" ? t("hours.closed") : `${e.startTime}–${e.endTime}`}</Badge>
                  <span className="text-muted-foreground">{e.reason}</span>
                  <span className="ml-auto">
                    <ConfirmAction action={deleteExceptionAction.bind(null, slug, e.id)} size="icon-sm">
                      <Trash2 aria-label={t("hours.deleteException")} />
                    </ConfirmAction>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">{t("hours.noExceptions")}</p>
          )}
          <ActionForm action={saveExceptionAction.bind(null, slug)} resetOnSuccess className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="ex-date">{t("hours.date")}</Label>
              <Input id="ex-date" name="date" type="date" min={today} required className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-type">{t("hours.type")}</Label>
              <select id="ex-type" name="type" className={selectClass}>
                <option value="CLOSED">{t("hours.closed")}</option>
                <option value="SPECIAL_HOURS">{t("hours.specialHours")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-start">{t("hours.from")}</Label>
              <Input id="ex-start" name="startTime" type="time" className="h-9 w-28" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-end">{t("hours.to")}</Label>
              <Input id="ex-end" name="endTime" type="time" className="h-9 w-28" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-last">{t("hours.lastSeating")}</Label>
              <Input id="ex-last" name="lastSeatingTime" type="time" className="h-9 w-28" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-reason">{t("hours.reason")}</Label>
              <Input id="ex-reason" name="reason" placeholder={t("hours.reasonPlaceholder")} className="h-9 w-48" />
            </div>
            <SubmitButton variant="outline">{t("hours.addException")}</SubmitButton>
            <span className="w-full"><FieldError name="startTime" /></span>
          </ActionForm>
        </Section>

        <Section title={t("hours.duration")} description={t("hours.durationDesc")}>
          <ActionForm action={saveDurationRulesAction.bind(null, slug)} className="space-y-3">
            <table className="text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pr-3 pb-2 font-medium">{t("hours.personsFrom")}</th>
                  <th className="pr-3 pb-2 font-medium">{t("hours.personsUntil")}</th>
                  <th className="pb-2 font-medium">{t("hours.minutes")}</th>
                </tr>
              </thead>
              <tbody>
                {ruleRows.map((r, i) => (
                  <tr key={r?.id ?? `empty-${i}`}>
                    <td className="py-1 pr-3"><Input name="min" type="number" min={1} defaultValue={r?.minPartySize} aria-label={t("hours.personsFrom")} className="h-8 w-24" /></td>
                    <td className="py-1 pr-3"><Input name="max" type="number" min={1} defaultValue={r?.maxPartySize} aria-label={t("hours.personsTo")} className="h-8 w-24" /></td>
                    <td className="py-1"><Input name="duration" type="number" min={15} step={15} defaultValue={r?.durationMinutes} aria-label={t("hours.minutes")} className="h-8 w-24" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dd">{t("hours.otherwise")}</Label>
                <Input id="dd" name="defaultDurationMinutes" type="number" min={15} step={15} defaultValue={settings?.defaultDurationMinutes ?? 120} className="h-9 w-28" />
              </div>
              <SubmitButton variant="outline">{t("hours.saveDuration")}</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

function ShiftFields({
  t,
  defaults,
  idPrefix,
}: {
  t: AdminT;
  defaults: { name: string; startTime: string; endTime: string; lastSeatingTime: string | null; slotIntervalMinutes: number | null };
  idPrefix: string;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`} className="text-xs text-muted-foreground">{t("hours.name")}</Label>
        <Input id={`${idPrefix}-name`} name="name" defaultValue={defaults.name} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-start`} className="text-xs text-muted-foreground">{t("hours.firstSlot")}</Label>
        <Input id={`${idPrefix}-start`} name="startTime" type="time" defaultValue={defaults.startTime} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-last`} className="text-xs text-muted-foreground">{t("hours.lastSeating")}</Label>
        <Input id={`${idPrefix}-last`} name="lastSeatingTime" type="time" defaultValue={defaults.lastSeatingTime ?? ""} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-end`} className="text-xs text-muted-foreground">{t("hours.shiftEnd")}</Label>
        <Input id={`${idPrefix}-end`} name="endTime" type="time" defaultValue={defaults.endTime} className="h-8 w-28" />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-int`} className="text-xs text-muted-foreground">{t("hours.interval")}</Label>
        <Input id={`${idPrefix}-int`} name="slotIntervalMinutes" type="number" min={5} step={5} placeholder={t("hours.intervalDefault")} defaultValue={defaults.slotIntervalMinutes ?? ""} className="h-8 w-20" />
      </div>
    </>
  );
}

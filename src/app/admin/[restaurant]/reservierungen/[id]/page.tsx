import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { PageHeader, Section } from "@/components/admin/page-header";
import { sourceLabel, statusLabel, StatusBadge } from "@/components/admin/status-badge";
import { StatusActions } from "@/components/admin/status-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isAdminKey } from "@/i18n/admin";
import { intlLocale } from "@/i18n/admin/format";
import { formatDateLong, formatTime } from "@/i18n/messages";
import { utcToLocalDate, utcToLocalTime } from "@/server/availability/time";
import { getAdminT } from "@/server/i18n";
import { allowedTransitions, type ReservationStatus } from "@/server/reservations/status";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import {
  cancelByRestaurantAction,
  changeStatusAction,
  modifyByRestaurantAction,
  releaseTablesAction,
  updateInternalNotesAction,
} from "../actions";
import { ReleaseButton } from "./release-button";

export default async function ReservationDetailPage(props: PageProps<"/admin/[restaurant]/reservierungen/[id]">) {
  const { restaurant: slug, id } = await props.params;
  const { restaurant, tdb } = await requireRestaurantAccess(slug);
  const { t, locale } = await getAdminT();
  const r = await tdb.reservation.findUnique({
    where: { id },
    include: {
      tables: { include: { table: { select: { name: true } } } },
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!r) notFound();
  const history = await tdb.auditLog.findMany({
    where: { entityId: r.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true, email: true } } },
  });

  const tz = restaurant.timezone;
  const open = ["REQUESTED", "CONFIRMED", "PENDING_PAYMENT"].includes(r.status);
  const allowed = allowedTransitions(r.status as ReservationStatus);
  const activeTables = r.tables.filter((rt) => rt.active);
  // Verlaufseinträge: bekannte Aktionen übersetzen, sonst Rohwert zeigen
  const auditLabel = (action: string) => {
    const key = `res.audit.${action}`;
    return isAdminKey(key) ? t(key) : action;
  };
  const dt = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "short", timeStyle: "short", timeZone: tz });

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/${slug}/reservierungen?date=${utcToLocalDate(r.startsAt, tz)}`} className="text-muted-foreground hover:underline">
          ‹ {t("res.list.title")}
        </Link>
      </p>
      <PageHeader
        title={r.guestName ?? t("res.detail.anonymized")}
        description={
          <>
            {t("res.detail.when", { date: formatDateLong(r.startsAt, locale, tz), from: formatTime(r.startsAt, locale, tz), to: formatTime(r.endsAt, locale, tz) })} ·{" "}
            {t("res.detail.persons", { count: r.partySize })} · {r.code}
          </>
        }
        actions={<StatusBadge status={r.status} className="text-sm" />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Section title={t("res.detail.details")}>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label={t("res.f.table")} value={activeTables.map((rt) => rt.table.name).join(" + ") || "–"} />
              <Item label={t("res.f.source")} value={`${sourceLabel(t, r.source)}${r.createdBy ? ` (${r.createdBy.name ?? r.createdBy.email})` : ""}`} />
              <Item label={t("res.f.email")} value={r.guestEmail ? <a href={`mailto:${r.guestEmail}`} className="underline">{r.guestEmail}</a> : "–"} />
              <Item label={t("res.f.phone")} value={r.guestPhone ? <a href={`tel:${r.guestPhone}`} className="underline">{r.guestPhone}</a> : "–"} />
              <Item label={t("res.detail.language")} value={r.locale === "en" ? t("res.detail.lang.en") : t("res.detail.lang.de")} />
              <Item
                label={t("res.detail.privacy")}
                value={r.privacyConsentAt ? t("res.detail.privacyRead", { date: dt.format(r.privacyConsentAt), version: String(r.privacyNoticeVersion) }) : "–"}
              />
              <div className="sm:col-span-2">
                <Item label={t("res.f.guestNotes")} value={r.guestNotes ?? "–"} />
              </div>
              {r.cancelReason ? (
                <div className="sm:col-span-2">
                  <Item label={t("res.f.reason")} value={r.cancelReason} />
                </div>
              ) : null}
            </dl>
          </Section>

          <Section title={t("res.f.internalNotes")} description={t("res.detail.noteHint")}>
            <ActionForm action={updateInternalNotesAction.bind(null, slug, r.id)} className="space-y-3">
              <Textarea name="internalNotes" defaultValue={r.internalNotes ?? ""} rows={3} aria-label={t("res.f.internalNotes")} />
              <SubmitButton variant="outline" size="sm">{t("res.detail.saveNote")}</SubmitButton>
            </ActionForm>
          </Section>

          {open ? (
            <Section title={t("res.detail.modify")} description={t("res.detail.modifyHint")}>
              <ActionForm action={modifyByRestaurantAction.bind(null, slug, r.id)} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mod-date">{t("res.f.date")}</Label>
                  <Input id="mod-date" name="date" type="date" defaultValue={utcToLocalDate(r.startsAt, tz)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mod-time">{t("res.f.time")}</Label>
                  <Input id="mod-time" name="time" type="time" step={300} defaultValue={utcToLocalTime(r.startsAt, tz)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mod-party">{t("res.f.partySize")}</Label>
                  <Input id="mod-party" name="partySize" type="number" min={1} defaultValue={r.partySize} className="w-24" />
                </div>
                <SubmitButton variant="outline">{t("res.detail.modify")}</SubmitButton>
              </ActionForm>
            </Section>
          ) : null}

          <Section title={t("res.detail.history")}>
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className="tabular w-32 shrink-0 text-muted-foreground">{dt.format(h.createdAt)}</span>
                  <span>
                    {auditLabel(h.action)}
                    {h.action === "reservation.status_changed" && h.meta && typeof h.meta === "object" && "to" in h.meta
                      ? ` → ${statusLabel(t, String((h.meta as { to: string }).to))}`
                      : ""}
                    <span className="text-muted-foreground"> · {h.user ? (h.user.name ?? h.user.email) : t("res.detail.guestSystem")}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="space-y-6">
          {allowed.length ? (
            <Section title={t("res.f.status")}>
              <StatusActions
                current={r.status}
                allowed={allowed}
                size="default"
                onChange={changeStatusAction.bind(null, slug, r.id) as (to: string) => ReturnType<typeof changeStatusAction>}
              />
            </Section>
          ) : null}
          {activeTables.length && ["ARRIVED", "NO_SHOW"].includes(r.status) ? (
            <Section title={t("res.f.table")} description={t("res.detail.releaseHint")}>
              <ReleaseButton action={releaseTablesAction.bind(null, slug, r.id)} />
            </Section>
          ) : null}
          {open ? (
            <Section title={t("res.detail.cancel")}>
              <ActionForm action={cancelByRestaurantAction.bind(null, slug, r.id)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-reason">{t("res.detail.reasonOptional")}</Label>
                  <Input id="c-reason" name="reason" />
                </div>
                {r.guestEmail ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="notifyGuest" defaultChecked /> {t("res.detail.notifyGuest")}
                  </label>
                ) : null}
                <SubmitButton variant="destructive">{t("res.detail.cancelSubmit")}</SubmitButton>
              </ActionForm>
            </Section>
          ) : null}
          <Button asChild variant="ghost" className="w-full">
            <Link href={`/admin/${slug}/timeline?date=${utcToLocalDate(r.startsAt, tz)}`}>{t("res.detail.showInTimeline")}</Link>
          </Button>
        </aside>
      </div>
    </>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line">{value}</dd>
    </div>
  );
}

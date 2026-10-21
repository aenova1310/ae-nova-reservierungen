import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { PageHeader, Section } from "@/components/admin/page-header";
import { SOURCE_LABEL, STATUS_LABEL, StatusBadge } from "@/components/admin/status-badge";
import { StatusActions } from "@/components/admin/status-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateLong, formatTime } from "@/i18n/messages";
import { utcToLocalDate, utcToLocalTime } from "@/server/availability/time";
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

const AUDIT_LABEL: Record<string, string> = {
  "reservation.created": "Angelegt",
  "reservation.cancelled": "Storniert",
  "reservation.modified": "Geändert",
  "reservation.status_changed": "Status geändert",
  "reservation.tables_released": "Tisch freigegeben",
};

export default async function ReservationDetailPage(props: PageProps<"/admin/[restaurant]/reservierungen/[id]">) {
  const { restaurant: slug, id } = await props.params;
  const { restaurant, tdb } = await requireRestaurantAccess(slug);
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
  const activeTables = r.tables.filter((t) => t.active);
  const dt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: tz });

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/${slug}/reservierungen?date=${utcToLocalDate(r.startsAt, tz)}`} className="text-muted-foreground hover:underline">
          ‹ Reservierungen
        </Link>
      </p>
      <PageHeader
        title={r.guestName ?? "Anonymisierte Reservierung"}
        description={
          <>
            {formatDateLong(r.startsAt, "de", tz)}, {formatTime(r.startsAt, "de", tz)}–{formatTime(r.endsAt, "de", tz)} Uhr · {r.partySize} Personen ·{" "}
            {r.code}
          </>
        }
        actions={<StatusBadge status={r.status} className="text-sm" />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Section title="Details">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Item label="Tisch" value={activeTables.map((t) => t.table.name).join(" + ") || "–"} />
              <Item label="Quelle" value={`${SOURCE_LABEL[r.source]}${r.createdBy ? ` (${r.createdBy.name ?? r.createdBy.email})` : ""}`} />
              <Item label="E-Mail" value={r.guestEmail ? <a href={`mailto:${r.guestEmail}`} className="underline">{r.guestEmail}</a> : "–"} />
              <Item label="Telefon" value={r.guestPhone ? <a href={`tel:${r.guestPhone}`} className="underline">{r.guestPhone}</a> : "–"} />
              <Item label="Sprache" value={r.locale === "en" ? "Englisch" : "Deutsch"} />
              <Item label="Datenschutzhinweis" value={r.privacyConsentAt ? `gelesen am ${dt.format(r.privacyConsentAt)} (Version ${r.privacyNoticeVersion})` : "–"} />
              <div className="sm:col-span-2">
                <Item label="Anmerkung des Gastes" value={r.guestNotes ?? "–"} />
              </div>
              {r.cancelReason ? (
                <div className="sm:col-span-2">
                  <Item label="Grund" value={r.cancelReason} />
                </div>
              ) : null}
            </dl>
          </Section>

          <Section title="Interne Notiz" description="Nur für Ihr Team sichtbar.">
            <ActionForm action={updateInternalNotesAction.bind(null, slug, r.id)} className="space-y-3">
              <Textarea name="internalNotes" defaultValue={r.internalNotes ?? ""} rows={3} aria-label="Interne Notiz" />
              <SubmitButton variant="outline" size="sm">Notiz speichern</SubmitButton>
            </ActionForm>
          </Section>

          {open ? (
            <Section title="Umbuchen" description="Der neue Zeitpunkt wird sofort belegt, der alte freigegeben. Der Gast erhält eine neue Bestätigung.">
              <ActionForm action={modifyByRestaurantAction.bind(null, slug, r.id)} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mod-date">Datum</Label>
                  <Input id="mod-date" name="date" type="date" defaultValue={utcToLocalDate(r.startsAt, tz)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mod-time">Uhrzeit</Label>
                  <Input id="mod-time" name="time" type="time" step={300} defaultValue={utcToLocalTime(r.startsAt, tz)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mod-party">Personen</Label>
                  <Input id="mod-party" name="partySize" type="number" min={1} defaultValue={r.partySize} className="w-24" />
                </div>
                <SubmitButton variant="outline">Umbuchen</SubmitButton>
              </ActionForm>
            </Section>
          ) : null}

          <Section title="Verlauf">
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3">
                  <span className="tabular w-32 shrink-0 text-muted-foreground">{dt.format(h.createdAt)}</span>
                  <span>
                    {AUDIT_LABEL[h.action] ?? h.action}
                    {h.action === "reservation.status_changed" && h.meta && typeof h.meta === "object" && "to" in h.meta
                      ? ` → ${STATUS_LABEL[String((h.meta as { to: string }).to)] ?? ""}`
                      : ""}
                    <span className="text-muted-foreground"> · {h.user ? (h.user.name ?? h.user.email) : "Gast/System"}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="space-y-6">
          {allowed.length ? (
            <Section title="Status">
              <StatusActions
                current={r.status}
                allowed={allowed}
                size="default"
                onChange={changeStatusAction.bind(null, slug, r.id) as (to: string) => ReturnType<typeof changeStatusAction>}
              />
            </Section>
          ) : null}
          {activeTables.length && ["ARRIVED", "NO_SHOW"].includes(r.status) ? (
            <Section title="Tisch" description="Gäste sind gegangen oder erscheinen nicht? Tisch für neue Buchungen freigeben.">
              <ReleaseButton action={releaseTablesAction.bind(null, slug, r.id)} />
            </Section>
          ) : null}
          {open ? (
            <Section title="Stornieren">
              <ActionForm action={cancelByRestaurantAction.bind(null, slug, r.id)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="c-reason">Grund (optional)</Label>
                  <Input id="c-reason" name="reason" />
                </div>
                {r.guestEmail ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="notifyGuest" defaultChecked /> Gast per E-Mail informieren
                  </label>
                ) : null}
                <SubmitButton variant="destructive">Reservierung stornieren</SubmitButton>
              </ActionForm>
            </Section>
          ) : null}
          <Button asChild variant="ghost" className="w-full">
            <Link href={`/admin/${slug}/timeline?date=${utcToLocalDate(r.startsAt, tz)}`}>Im Tagesplan zeigen</Link>
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

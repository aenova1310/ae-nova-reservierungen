import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { PageHeader, Section } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/server/db";
import { findGuestReservations } from "@/server/privacy/anonymize";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { eraseGuestAction } from "./actions";

export default async function PrivacyPage(props: PageProps<"/admin/[restaurant]/datenschutz">) {
  const { restaurant: slug } = await props.params;
  const sp = await props.searchParams;
  const { restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
  const email = typeof sp.email === "string" ? sp.email.trim().toLowerCase().slice(0, 254) : "";
  const [rows, settings, requests] = await Promise.all([
    email ? findGuestReservations(restaurant.id, email) : Promise.resolve([]),
    db.restaurantSettings.findUnique({ where: { restaurantId: restaurant.id } }),
    db.privacyRequest.findMany({ where: { restaurantId: restaurant.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const dt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: restaurant.timezone });

  return (
    <>
      <PageHeader
        title="Datenschutz"
        description={`Gastdaten werden automatisch ${settings?.anonymizeAfterDays ?? 180} Tage nach dem Reservierungsdatum anonymisiert. Kennzahlen bleiben anonym erhalten.`}
      />
      <div className="space-y-6">
        <Section title="Auskunft & Löschung auf Anfrage" description="Suchen Sie nach der E-Mail-Adresse des Gastes. Bitte prüfen Sie vorher, dass die Anfrage wirklich von dieser Person stammt.">
          <form method="get" className="flex flex-wrap items-end gap-2" role="search">
            <div className="space-y-1.5">
              <Label htmlFor="p-email">E-Mail des Gastes</Label>
              <Input id="p-email" name="email" type="email" defaultValue={email} required className="w-72" />
            </div>
            <Button type="submit" variant="secondary">Suchen</Button>
          </form>

          {email ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm">
                {rows.length === 0 ? "Keine Daten zu dieser E-Mail-Adresse gespeichert." : `${rows.length} Reservierung(en) gefunden:`}
              </p>
              {rows.length ? (
                <>
                  <ul className="divide-y rounded-md border text-sm">
                    {rows.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                        <span className="tabular w-44">{dt.format(r.startsAt)}</span>
                        <span>{r.guestName}</span>
                        <span className="text-muted-foreground">{r.partySize} P. · {r.code}</span>
                        <StatusBadge status={r.status} className="ml-auto" />
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-6">
                    <Button asChild variant="outline">
                      <a href={`/admin/${slug}/datenschutz/export?email=${encodeURIComponent(email)}`}>Datenauskunft herunterladen (JSON)</a>
                    </Button>
                    <ActionForm action={eraseGuestAction.bind(null, slug)} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="email" value={email} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="confirm" required /> Daten unwiderruflich anonymisieren
                      </label>
                      <SubmitButton variant="destructive">Löschen</SubmitButton>
                      <FieldError name="email" />
                    </ActionForm>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hinweis: Bevorstehende Reservierungen bleiben als anonyme Buchung bestehen (Tisch bleibt blockiert). Stornieren Sie sie vorher, falls der Gast nicht kommt.
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section title="Protokoll" description="Nachweis bearbeiteter Anfragen (ohne E-Mail-Adresse im Klartext).">
          {requests.length ? (
            <ul className="space-y-1 text-sm">
              {requests.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <span className="tabular w-44 text-muted-foreground">{dt.format(r.createdAt)}</span>
                  <span>{r.type === "EXPORT" ? "Auskunft" : "Löschung"} · {r.affectedCount} Datensätze</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Noch keine Anfragen bearbeitet.</p>
          )}
        </Section>
      </div>
    </>
  );
}

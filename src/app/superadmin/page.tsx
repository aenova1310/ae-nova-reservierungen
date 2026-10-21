import Link from "next/link";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listTenants, platformSummary } from "@/server/superadmin/tenants";
import { setPlanAction, setStatusAction } from "./actions";

const euro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function SuperAdminPage(props: PageProps<"/superadmin">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const [summary, all] = await Promise.all([platformSummary(), listTenants()]);
  const tenants = q ? all.filter((t) => `${t.name} ${t.slug} ${t.organization} ${t.city ?? ""}`.toLowerCase().includes(q)) : all;
  const dt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

  return (
    <>
      {typeof sp.neu === "string" ? (
        <p role="status" className="mb-6 rounded-md border border-salbei/30 bg-salbei/10 px-4 py-3 text-sm">
          Restaurant <strong>/{sp.neu}</strong> angelegt. Der Inhaber kann sich jetzt anmelden und Öffnungszeiten sowie Tische pflegen.
        </p>
      ) : null}
      <PageHeader
        title="Mandanten"
        description="Alle Restaurants der Plattform mit Tarif, Status und Buchungsvolumen."
        actions={
          <Button asChild>
            <Link href="/superadmin/neu">Restaurant anlegen</Link>
          </Button>
        }
      />

      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4">
        <Kpi label="Monatsumsatz (netto)" value={euro(summary.mrrCents)} />
        {summary.plans.map((p) => (
          <Kpi key={p.code} label={`Aktiv im Tarif ${p.name}`} value={String(p.activeCount)} />
        ))}
        <Kpi label="Buchungen, letzte 30 Tage" value={summary.reservations30d.toLocaleString("de-DE")} />
      </dl>

      <form method="get" role="search" className="mb-4 flex gap-2">
        <label htmlFor="q" className="sr-only">Suche</label>
        <input id="q" name="q" defaultValue={q} placeholder="Name, Slug, Ort" className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm" />
        <Button type="submit" variant="secondary" size="sm" className="h-9">Suchen</Button>
      </form>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Restaurant</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Inhaber</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Tarif</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Buchungen 30 T.</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Gäste 30 T.</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Kommend</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Gesamt</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map((t) => (
              <tr key={t.id} className={t.status === "SUSPENDED" ? "bg-muted/40" : undefined}>
                <td className="px-4 py-3">
                  <Link href={`/admin/${t.slug}`} className="font-medium underline-offset-4 hover:underline">{t.name}</Link>
                  {t.status === "SUSPENDED" ? <Badge variant="destructive" className="ml-2">Gesperrt</Badge> : null}
                  <span className="block text-xs text-muted-foreground">
                    /{t.slug}{t.city ? ` · ${t.city}` : ""} · seit {dt.format(t.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs">
                  {t.owners.length ? t.owners.map((o) => (
                    <span key={o.email} className="block">
                      {o.email}
                      <span className="text-muted-foreground"> · {o.lastLoginAt ? `zuletzt ${dt.format(o.lastLoginAt)}` : "nie angemeldet"}</span>
                    </span>
                  )) : <span className="text-muted-foreground">–</span>}
                </td>
                <td className="px-4 py-3"><Badge variant={t.planCode === "PRO" ? "default" : "secondary"}>{t.planCode === "PRO" ? "Pro" : "Basic"}</Badge></td>
                <td className="tabular px-4 py-3 text-right">{t.reservations30d}</td>
                <td className="tabular px-4 py-3 text-right">{t.guests30d}</td>
                <td className="tabular px-4 py-3 text-right">{t.upcoming}</td>
                <td className="tabular px-4 py-3 text-right">{t.reservationsTotal}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <ConfirmAction
                      action={setPlanAction.bind(null, t.id, t.planCode === "PRO" ? "BASIC" : "PRO")}
                      title={`Tarif von ${t.name} ändern?`}
                      description={t.planCode === "PRO"
                        ? "Auf Basic: Pro-Funktionen werden sofort gesperrt, Daten bleiben erhalten. Weitere Zugänge bleiben bestehen, neue sind nicht möglich."
                        : "Auf Pro: alle Pro-Funktionen werden sofort freigeschaltet."}
                      confirmLabel={t.planCode === "PRO" ? "Auf Basic" : "Auf Pro"}
                      variant="outline"
                    >
                      {t.planCode === "PRO" ? "Auf Basic" : "Auf Pro"}
                    </ConfirmAction>
                    <ConfirmAction
                      action={setStatusAction.bind(null, t.id, t.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE")}
                      title={t.status === "ACTIVE" ? `${t.name} sperren?` : `${t.name} freischalten?`}
                      description={t.status === "ACTIVE"
                        ? "Das Widget nimmt keine Buchungen mehr an und zeigt einen Hinweis. Bestehende Reservierungen und der Admin-Zugang bleiben erhalten."
                        : "Online-Buchungen sind sofort wieder möglich."}
                      confirmLabel={t.status === "ACTIVE" ? "Sperren" : "Freischalten"}
                      destructive={t.status === "ACTIVE"}
                    >
                      {t.status === "ACTIVE" ? "Sperren" : "Freischalten"}
                    </ConfirmAction>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tenants.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Keine Restaurants gefunden.</p> : null}
      </div>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-medium">{value}</dd>
    </div>
  );
}

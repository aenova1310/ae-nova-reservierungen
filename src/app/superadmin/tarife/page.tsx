import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLAN_FEATURES } from "@/server/plans/features";
import { platformSummary } from "@/server/superadmin/tenants";
import { updatePriceAction } from "../actions";

const FEATURE_LABELS: Record<string, string> = {
  floorplanEditor: "Raumplan-Editor",
  tableView: "Tischansicht / 360°",
  deposits: "Anzahlung (Stripe)",
  statistics: "Statistiken",
  removePoweredBy: "Ohne „powered by“",
  maxMembers: "Admin-Zugänge",
};

export default async function PlansPage() {
  const { plans } = await platformSummary();
  return (
    <>
      <PageHeader title="Tarife & Preise" description="Preise sind netto pro Restaurant und Monat. Der Funktionsumfang ist im Code festgelegt (src/server/plans/features.ts)." />
      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((p) => {
          const features = PLAN_FEATURES[p.code];
          return (
            <Section key={p.code} title={p.name} description={`${p.activeCount} aktive Restaurants`}>
              <ActionForm action={updatePriceAction.bind(null, p.code)} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`name-${p.code}`}>Anzeigename</Label>
                  <Input id={`name-${p.code}`} name="name" defaultValue={p.name} className="w-32" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`price-${p.code}`}>Preis €/Monat netto</Label>
                  <Input id={`price-${p.code}`} name="price" inputMode="decimal" defaultValue={(p.priceMonthlyCents / 100).toFixed(2).replace(".", ",")} className="w-32" />
                  <FieldError name="price" />
                </div>
                <SubmitButton variant="outline">Speichern</SubmitButton>
              </ActionForm>
              <ul className="mt-5 space-y-1 text-sm">
                {Object.entries(features).map(([key, value]) => (
                  <li key={key} className="flex justify-between gap-4 border-b border-dashed py-1 last:border-0">
                    <span>{FEATURE_LABELS[key] ?? key}</span>
                    <span className="text-muted-foreground">
                      {typeof value === "boolean" ? (value ? "enthalten" : "–") : Number.isFinite(value) ? value : "unbegrenzt"}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })}
      </div>
    </>
  );
}

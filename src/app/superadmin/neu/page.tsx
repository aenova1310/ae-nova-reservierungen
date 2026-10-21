import { PageHeader, Section } from "@/components/admin/page-header";
import { env } from "@/server/env";
import { CreateTenantForm } from "./create-tenant-form";

export default function NewTenantPage() {
  return (
    <>
      <PageHeader
        title="Restaurant anlegen"
        description="Legt Betrieb, Restaurant, Inhaber-Zugang und Standardeinstellungen an. Öffnungszeiten und Tische pflegt das Restaurant danach selbst."
      />
      <Section title="Stammdaten">
        <CreateTenantForm appUrl={env().APP_URL.replace(/\/$/, "")} />
      </Section>
    </>
  );
}

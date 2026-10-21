import { EmbedGenerator } from "@/components/admin/embed-generator";
import { PageHeader, Section } from "@/components/admin/page-header";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { requireRestaurantAccess } from "@/server/tenancy/access";

export default async function EmbedPage(props: PageProps<"/admin/[restaurant]/einbinden">) {
  const { restaurant: slug } = await props.params;
  const { restaurant } = await requireRestaurantAccess(slug);
  const branding = await db.branding.findUnique({ where: { restaurantId: restaurant.id } });
  const appUrl = env().APP_URL.replace(/\/$/, "");

  const privacyBlock = `Online-Reservierung
Für Tischreservierungen nutzen wir den Dienst „A&E NOVA Reservierungen“ (Auftragsverarbeiter nach Art. 28 DSGVO, Server in der EU). Beim Aufruf des Reservierungsformulars wird Ihre IP-Adresse technisch bedingt an diesen Dienst übertragen. Wenn Sie reservieren, verarbeiten wir Name, E-Mail-Adresse, Telefonnummer und Ihre Anmerkungen zur Durchführung der Reservierung (Art. 6 Abs. 1 lit. b DSGVO). Das Formular setzt keine Cookies und verwendet kein Tracking. Ihre Angaben werden spätestens 180 Tage nach dem Reservierungsdatum anonymisiert.`;

  return (
    <>
      <PageHeader title="Website-Einbindung" description="Code kopieren und auf Ihrer Website einfügen – fertig. Keine Cookies, kein Tracking." />
      <div className="space-y-6">
        <Section title="Code-Generator">
          <EmbedGenerator appUrl={appUrl} slug={slug} brandColor={branding?.primaryColor ?? "#6B1E2E"} restaurantName={restaurant.name} />
        </Section>
        <Section
          title="Textbaustein für Ihre Datenschutzerklärung"
          description="Bitte in die Datenschutzerklärung Ihrer Website aufnehmen und an Ihre Situation anpassen (z. B. kürzere Löschfrist)."
        >
          <pre className="rounded-md border bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap">{privacyBlock}</pre>
        </Section>
      </div>
    </>
  );
}

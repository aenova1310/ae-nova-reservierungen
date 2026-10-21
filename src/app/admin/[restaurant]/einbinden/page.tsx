import { EmbedGenerator } from "@/components/admin/embed-generator";
import { PageHeader, Section } from "@/components/admin/page-header";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { getAdminT } from "@/server/i18n";
import { requireRestaurantAccess } from "@/server/tenancy/access";

export default async function EmbedPage(props: PageProps<"/admin/[restaurant]/einbinden">) {
  const { restaurant: slug } = await props.params;
  const { restaurant } = await requireRestaurantAccess(slug);
  const { t } = await getAdminT();
  const branding = await db.branding.findUnique({ where: { restaurantId: restaurant.id } });
  const appUrl = env().APP_URL.replace(/\/$/, "");

  const privacyBlock = t("embed.privacyBlock");

  return (
    <>
      <PageHeader title={t("nav.embed")} description={t("embed.description")} />
      <div className="space-y-6">
        <Section title={t("embed.generator")}>
          <EmbedGenerator appUrl={appUrl} slug={slug} brandColor={branding?.primaryColor ?? "#6B1E2E"} restaurantName={restaurant.name} />
        </Section>
        <Section
          title={t("embed.privacyTitle")}
          description={t("embed.privacyHelp")}
        >
          <pre className="rounded-md border bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap">{privacyBlock}</pre>
        </Section>
      </div>
    </>
  );
}

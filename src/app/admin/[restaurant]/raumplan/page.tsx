import Link from "next/link";
import { FloorplanEditor } from "@/components/admin/floorplan/floorplan-editor";
import { PageHeader, Section } from "@/components/admin/page-header";
import { loadFloorplan } from "@/server/floorplan/service";
import { getAdminT } from "@/server/i18n";
import { hasFeature } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";

export default async function FloorplanPage(props: PageProps<"/admin/[restaurant]/raumplan">) {
  const { restaurant: slug } = await props.params;
  const { restaurant } = await requireRestaurantAccess(slug);
  const { t } = await getAdminT();

  if (!hasFeature(restaurant.planCode, "floorplanEditor")) {
    return (
      <>
        <PageHeader title={t("nav.floorplan")} />
        <Section title={t("common.proOnly")}>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("fp.proText")} {t("common.proUpsell")}
          </p>
        </Section>
      </>
    );
  }

  const plan = await loadFloorplan(restaurant.id);
  return (
    <>
      <PageHeader
        title={t("nav.floorplan")}
        description={
          <>
            {t("fp.descBefore")}{" "}
            <Link href={`/admin/${slug}/tische`} className="underline underline-offset-4 hover:text-foreground">
              {t("nav.tables")}
            </Link>
            .
          </>
        }
      />
      {plan.tables.length === 0 ? (
        <p className="mb-4 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("fp.noTables")}
        </p>
      ) : null}
      <p className="mb-4 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground xl:hidden">
        {t("fp.largeScreen")}
      </p>
      <FloorplanEditor slug={slug} initial={{ areas: plan.areas, tables: plan.tables }} version={plan.version} />
    </>
  );
}

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
  // Der Editor zeigt nur aktive Tische; Namen deaktivierter Tische bleiben belegt
  const active = plan.tables.filter((tb) => tb.active);
  const takenNames = plan.tables.filter((tb) => !tb.active).map((tb) => tb.name);
  return (
    <>
      <PageHeader title={t("nav.floorplan")} description={t("fp.descEditor")} />
      <p className="mb-4 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground xl:hidden">
        {t("fp.largeScreen")}
      </p>
      <FloorplanEditor slug={slug} initial={{ areas: plan.areas, tables: active }} version={plan.version} takenNames={takenNames} />
    </>
  );
}

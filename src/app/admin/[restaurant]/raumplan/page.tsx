import Link from "next/link";
import { FloorplanEditor } from "@/components/admin/floorplan/floorplan-editor";
import { PageHeader, Section } from "@/components/admin/page-header";
import { loadFloorplan } from "@/server/floorplan/service";
import { hasFeature } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";

export default async function FloorplanPage(props: PageProps<"/admin/[restaurant]/raumplan">) {
  const { restaurant: slug } = await props.params;
  const { restaurant } = await requireRestaurantAccess(slug);

  if (!hasFeature(restaurant.planCode, "floorplanEditor")) {
    return (
      <>
        <PageHeader title="Raumplan" />
        <Section title="Im Pro-Tarif enthalten">
          <p className="max-w-prose text-sm text-muted-foreground">
            Zeichnen Sie Ihr Restaurant nach: Bereiche anlegen, Tische per Ziehen platzieren, drehen und in Form und Größe anpassen. Der
            Plan ist die Grundlage für die Tischansicht im Buchungs-Widget. Ihr Tarif lässt sich jederzeit auf Pro umstellen – sprechen Sie
            uns an.
          </p>
        </Section>
      </>
    );
  }

  const plan = await loadFloorplan(restaurant.id);
  return (
    <>
      <PageHeader
        title="Raumplan"
        description={
          <>
            Tische anlegen, umbenennen und Plätze festlegen: unter{" "}
            <Link href={`/admin/${slug}/tische`} className="underline underline-offset-4 hover:text-foreground">
              Tische &amp; Bereiche
            </Link>
            .
          </>
        }
      />
      {plan.tables.length === 0 ? (
        <p className="mb-4 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
          Noch keine Tische angelegt – legen Sie zuerst Tische an, dann können Sie sie hier platzieren.
        </p>
      ) : null}
      <p className="mb-4 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground xl:hidden">
        Der Raumplan lässt sich am besten an einem größeren Bildschirm bearbeiten.
      </p>
      <FloorplanEditor slug={slug} initial={{ areas: plan.areas, tables: plan.tables }} version={plan.version} />
    </>
  );
}

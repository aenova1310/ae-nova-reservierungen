import Link from "next/link";
import { LivePlan } from "@/components/admin/live-plan/live-plan";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { formatDateLong } from "@/i18n/messages";
import { dayBounds } from "@/server/admin/reservations";
import { loadLivePlan } from "@/server/admin/live-plan";
import { addDaysToDate, isLocalDate, utcToLocalDate } from "@/server/availability/time";
import { getAdminT } from "@/server/i18n";
import { hasFeature } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";

/** Live-Tischplan: Raumplan mit Reservierungen je Tisch (alle Tarife; ohne Raumplan automatisch angeordnet). */
export default async function LivePlanPage(props: PageProps<"/admin/[restaurant]/tischplan">) {
  const { restaurant: slug } = await props.params;
  const sp = await props.searchParams;
  const { restaurant, tdb } = await requireRestaurantAccess(slug);
  const { t, locale } = await getAdminT();
  const tz = restaurant.timezone;
  const today = utcToLocalDate(new Date(), tz);
  const date = typeof sp.date === "string" && isLocalDate(sp.date) ? sp.date : today;
  const data = await loadLivePlan(tdb, restaurant, date);
  const dateLabel = formatDateLong(dayBounds(date, tz).from, locale, tz);

  return (
    <>
      <PageHeader
        title={t("live.title")}
        description={data.closed ? t("live.closed", { date: dateLabel }) : dateLabel}
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" aria-label={t("res.prevDay")}>
              <Link href={`?date=${addDaysToDate(date, -1)}`}>‹</Link>
            </Button>
            <Button asChild variant={date === today ? "secondary" : "outline"} size="sm">
              <Link href="?">{t("res.today.title")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm" aria-label={t("res.nextDay")}>
              <Link href={`?date=${addDaysToDate(date, 1)}`}>›</Link>
            </Button>
          </div>
        }
      />
      {/* key: beim Tageswechsel Auswahl und Uhrzeit zurücksetzen */}
      <LivePlan key={date} slug={slug} data={data} canEditPlan={hasFeature(restaurant.planCode, "floorplanEditor")} />
    </>
  );
}

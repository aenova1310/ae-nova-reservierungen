import Link from "next/link";
import { NewReservationDialog } from "@/components/admin/new-reservation-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { ReservationTable } from "@/components/admin/reservation-table";
import { Button } from "@/components/ui/button";
import { formatDateLong } from "@/i18n/messages";
import { seatOptions } from "@/server/admin/options";
import { dayBounds, dayStats, listReservations } from "@/server/admin/reservations";
import { utcToLocalDate, utcToLocalTime } from "@/server/availability/time";
import { getAdminT } from "@/server/i18n";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { createManualReservationAction } from "./reservierungen/actions";

export default async function TodayPage(props: PageProps<"/admin/[restaurant]">) {
  const { restaurant: slug } = await props.params;
  const { restaurant, tdb } = await requireRestaurantAccess(slug);
  const { t, locale } = await getAdminT();
  const tz = restaurant.timezone;
  const now = new Date();
  const today = utcToLocalDate(now, tz);
  const { from, to } = dayBounds(today, tz);

  const [stats, rows, seats, pendingRequests] = await Promise.all([
    dayStats(tdb, today, tz),
    listReservations(tdb, { from, to, status: "open" }),
    seatOptions(tdb, t),
    tdb.reservation.count({ where: { status: "REQUESTED", startsAt: { gte: now } } }),
  ]);
  const upcoming = rows.filter((r) => r.endsAt > now);
  const action = createManualReservationAction.bind(null, slug);
  const roundedNow = utcToLocalTime(new Date(Math.ceil(now.getTime() / 300_000) * 300_000), tz);

  return (
    <>
      <PageHeader
        title={t("res.today.title")}
        description={formatDateLong(now, locale, tz)}
        actions={
          <>
            <NewReservationDialog
              action={action}
              seatGroups={seats}
              today={today}
              nowTime={roundedNow}
              defaultSource="WALK_IN"
              trigger={<Button variant="outline">{t("res.today.walkIn")}</Button>}
            />
            <NewReservationDialog action={action} seatGroups={seats} today={today} nowTime={roundedNow} />
          </>
        }
      />

      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {[
          { label: t("res.today.kpi.reservations"), value: stats.reservations },
          { label: t("res.today.kpi.guests"), value: stats.guests },
          { label: t("res.today.kpi.arrived"), value: stats.arrived },
          { label: t("res.today.kpi.requests"), value: pendingRequests, href: `/admin/${slug}/reservierungen?status=REQUESTED&range=upcoming` },
        ].map((k) => (
          <div key={k.label} className="bg-card px-5 py-4">
            <dt className="text-sm text-muted-foreground">{k.label}</dt>
            <dd className="tabular mt-1 text-3xl font-medium">
              {k.href && k.value > 0 ? (
                <Link href={k.href} className="underline-offset-4 hover:underline">
                  {k.value}
                </Link>
              ) : (
                k.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-medium">{t("res.today.next")}</h2>
        <Link href={`/admin/${slug}/timeline`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {t("res.today.viewTimeline")}
        </Link>
      </div>
      <ReservationTable rows={upcoming} slug={slug} timeZone={tz} empty={t("res.today.empty")} />
    </>
  );
}

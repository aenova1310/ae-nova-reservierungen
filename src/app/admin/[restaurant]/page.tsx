import Link from "next/link";
import { NewReservationDialog } from "@/components/admin/new-reservation-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { ReservationTable } from "@/components/admin/reservation-table";
import { Button } from "@/components/ui/button";
import { formatDateLong } from "@/i18n/messages";
import { seatOptions } from "@/server/admin/options";
import { dayBounds, dayStats, listReservations } from "@/server/admin/reservations";
import { utcToLocalDate, utcToLocalTime } from "@/server/availability/time";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { createManualReservationAction } from "./reservierungen/actions";

export default async function TodayPage(props: PageProps<"/admin/[restaurant]">) {
  const { restaurant: slug } = await props.params;
  const { restaurant, tdb } = await requireRestaurantAccess(slug);
  const tz = restaurant.timezone;
  const now = new Date();
  const today = utcToLocalDate(now, tz);
  const { from, to } = dayBounds(today, tz);

  const [stats, rows, seats, pendingRequests] = await Promise.all([
    dayStats(tdb, today, tz),
    listReservations(tdb, { from, to, status: "open" }),
    seatOptions(tdb),
    tdb.reservation.count({ where: { status: "REQUESTED", startsAt: { gte: now } } }),
  ]);
  const upcoming = rows.filter((r) => r.endsAt > now);
  const action = createManualReservationAction.bind(null, slug);
  const roundedNow = utcToLocalTime(new Date(Math.ceil(now.getTime() / 300_000) * 300_000), tz);

  return (
    <>
      <PageHeader
        title="Heute"
        description={formatDateLong(now, "de", tz)}
        actions={
          <>
            <NewReservationDialog
              action={action}
              seatGroups={seats}
              today={today}
              nowTime={roundedNow}
              defaultSource="WALK_IN"
              trigger={<Button variant="outline">Walk-in</Button>}
            />
            <NewReservationDialog action={action} seatGroups={seats} today={today} nowTime={roundedNow} />
          </>
        }
      />

      <dl className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
        {[
          { label: "Reservierungen", value: stats.reservations },
          { label: "Gäste erwartet", value: stats.guests },
          { label: "Bereits da", value: stats.arrived },
          { label: "Offene Anfragen", value: pendingRequests, href: `/admin/${slug}/reservierungen?status=REQUESTED&range=upcoming` },
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
        <h2 className="font-medium">Nächste Gäste</h2>
        <Link href={`/admin/${slug}/timeline`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Tagesplan ansehen
        </Link>
      </div>
      <ReservationTable rows={upcoming} slug={slug} timeZone={tz} empty="Für heute stehen keine weiteren Gäste an." />
    </>
  );
}

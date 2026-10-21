import Link from "next/link";
import { NewReservationDialog } from "@/components/admin/new-reservation-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { ReservationTable } from "@/components/admin/reservation-table";
import { statusLabel } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminKey } from "@/i18n/admin";
import { seatOptions } from "@/server/admin/options";
import { dayBounds, listReservations, STATUS_FILTERS, type StatusFilter } from "@/server/admin/reservations";
import { addDaysToDate, isLocalDate, utcToLocalDate, utcToLocalTime } from "@/server/availability/time";
import { getAdminT } from "@/server/i18n";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { createManualReservationAction } from "./actions";

const RANGES = { day: "res.list.range.day", upcoming: "res.list.range.upcoming", past: "res.list.range.past" } as const satisfies Record<string, AdminKey>;
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export default async function ReservationsPage(props: PageProps<"/admin/[restaurant]/reservierungen">) {
  const { restaurant: slug } = await props.params;
  const sp = await props.searchParams;
  const { restaurant, tdb } = await requireRestaurantAccess(slug);
  const { t } = await getAdminT();
  const tz = restaurant.timezone;
  const today = utcToLocalDate(new Date(), tz);

  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const range = (one(sp.range) as keyof typeof RANGES) ?? "day";
  const date = isLocalDate(one(sp.date) ?? "") ? one(sp.date)! : today;
  const status = (STATUS_FILTERS as readonly string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as StatusFilter) : "open";
  const q = one(sp.q)?.slice(0, 100);
  const source = one(sp.source);

  let bounds = dayBounds(date, tz);
  if (range === "upcoming") bounds = { from: new Date(), to: dayBounds(addDaysToDate(today, 30), tz).to };
  if (range === "past") bounds = { from: dayBounds(addDaysToDate(today, -30), tz).from, to: new Date() };
  // Suche ohne Datumsbezug: ein Jahr zurück bis ein Jahr voraus
  if (q) bounds = { from: dayBounds(addDaysToDate(today, -365), tz).from, to: dayBounds(addDaysToDate(today, 365), tz).to };

  const [rows, seats] = await Promise.all([listReservations(tdb, { ...bounds, status, q, source }), seatOptions(tdb, t)]);
  const nav = (d: string) => `?range=day&date=${d}&status=${status}${source ? `&source=${source}` : ""}`;

  return (
    <>
      <PageHeader
        title={t("res.list.title")}
        description={`${t("res.list.entries", { count: rows.length })} · ${t("res.list.guests", { count: rows.reduce((s, r) => s + r.partySize, 0) })}`}
        actions={
          <NewReservationDialog
            action={createManualReservationAction.bind(null, slug)}
            seatGroups={seats}
            today={date}
            nowTime={utcToLocalTime(new Date(), tz)}
          />
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <div className="flex items-center gap-1">
          {range === "day" && !q ? (
            <Button asChild variant="ghost" size="sm" aria-label={t("res.prevDay")}>
              <Link href={nav(addDaysToDate(date, -1))}>‹</Link>
            </Button>
          ) : null}
          <label className="sr-only" htmlFor="f-date">{t("res.f.date")}</label>
          <Input id="f-date" type="date" name="date" defaultValue={date} className="h-9 w-40" />
          {range === "day" && !q ? (
            <Button asChild variant="ghost" size="sm" aria-label={t("res.nextDay")}>
              <Link href={nav(addDaysToDate(date, 1))}>›</Link>
            </Button>
          ) : null}
        </div>
        <label className="sr-only" htmlFor="f-range">{t("res.list.range")}</label>
        <select id="f-range" name="range" defaultValue={range} className={selectClass}>
          {Object.entries(RANGES).map(([v, l]) => (
            <option key={v} value={v}>{t(l)}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-status">{t("res.f.status")}</label>
        <select id="f-status" name="status" defaultValue={status} className={selectClass}>
          <option value="open">{t("res.list.status.open")}</option>
          {(["REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW", "CANCELLED"] as const).map((s) => (
            <option key={s} value={s}>{statusLabel(t, s)}</option>
          ))}
          <option value="all">{t("res.list.status.all")}</option>
        </select>
        <label className="sr-only" htmlFor="f-source">{t("res.f.source")}</label>
        <select id="f-source" name="source" defaultValue={source ?? ""} className={selectClass}>
          <option value="">{t("res.list.allSources")}</option>
          <option value="ONLINE">{t("res.source.ONLINE")}</option>
          <option value="PHONE">{t("res.source.PHONE")}</option>
          <option value="WALK_IN">{t("res.source.WALK_IN")}</option>
        </select>
        <label className="sr-only" htmlFor="f-q">{t("res.list.search")}</label>
        <Input id="f-q" name="q" type="search" placeholder={t("res.list.searchPlaceholder")} defaultValue={q} className="h-9 w-56" />
        <Button type="submit" variant="secondary" size="sm" className="h-9">{t("res.list.show")}</Button>
        {date !== today || q || status !== "open" || source || range !== "day" ? (
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href="?">{t("res.list.reset")}</Link>
          </Button>
        ) : null}
      </form>

      <ReservationTable
        rows={rows}
        slug={slug}
        timeZone={tz}
        showDate={range !== "day" || !!q}
        empty={q ? t("res.list.emptySearch") : t("res.list.emptyRange")}
      />
    </>
  );
}

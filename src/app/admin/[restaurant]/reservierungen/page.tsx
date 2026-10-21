import Link from "next/link";
import { NewReservationDialog } from "@/components/admin/new-reservation-dialog";
import { PageHeader } from "@/components/admin/page-header";
import { ReservationTable } from "@/components/admin/reservation-table";
import { STATUS_LABEL } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { seatOptions } from "@/server/admin/options";
import { dayBounds, listReservations, STATUS_FILTERS, type StatusFilter } from "@/server/admin/reservations";
import { addDaysToDate, isLocalDate, utcToLocalDate, utcToLocalTime } from "@/server/availability/time";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { createManualReservationAction } from "./actions";

const RANGES = { day: "Tag", upcoming: "Kommende 30 Tage", past: "Letzte 30 Tage" } as const;
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export default async function ReservationsPage(props: PageProps<"/admin/[restaurant]/reservierungen">) {
  const { restaurant: slug } = await props.params;
  const sp = await props.searchParams;
  const { restaurant, tdb } = await requireRestaurantAccess(slug);
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

  const [rows, seats] = await Promise.all([listReservations(tdb, { ...bounds, status, q, source }), seatOptions(tdb)]);
  const nav = (d: string) => `?range=day&date=${d}&status=${status}${source ? `&source=${source}` : ""}`;

  return (
    <>
      <PageHeader
        title="Reservierungen"
        description={`${rows.length} Einträge · ${rows.reduce((s, r) => s + r.partySize, 0)} Gäste`}
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
            <Button asChild variant="ghost" size="sm" aria-label="Vorheriger Tag">
              <Link href={nav(addDaysToDate(date, -1))}>‹</Link>
            </Button>
          ) : null}
          <label className="sr-only" htmlFor="f-date">Datum</label>
          <Input id="f-date" type="date" name="date" defaultValue={date} className="h-9 w-40" />
          {range === "day" && !q ? (
            <Button asChild variant="ghost" size="sm" aria-label="Nächster Tag">
              <Link href={nav(addDaysToDate(date, 1))}>›</Link>
            </Button>
          ) : null}
        </div>
        <label className="sr-only" htmlFor="f-range">Zeitraum</label>
        <select id="f-range" name="range" defaultValue={range} className={selectClass}>
          {Object.entries(RANGES).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-status">Status</label>
        <select id="f-status" name="status" defaultValue={status} className={selectClass}>
          <option value="open">Aktive</option>
          {(["REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW", "CANCELLED"] as const).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
          <option value="all">Alle</option>
        </select>
        <label className="sr-only" htmlFor="f-source">Quelle</label>
        <select id="f-source" name="source" defaultValue={source ?? ""} className={selectClass}>
          <option value="">Alle Quellen</option>
          <option value="ONLINE">Online</option>
          <option value="PHONE">Telefon</option>
          <option value="WALK_IN">Walk-in</option>
        </select>
        <label className="sr-only" htmlFor="f-q">Suche</label>
        <Input id="f-q" name="q" type="search" placeholder="Name, E-Mail, Telefon, Code" defaultValue={q} className="h-9 w-56" />
        <Button type="submit" variant="secondary" size="sm" className="h-9">Anzeigen</Button>
        {date !== today || q || status !== "open" || source || range !== "day" ? (
          <Button asChild variant="ghost" size="sm" className="h-9">
            <Link href="?">Zurücksetzen</Link>
          </Button>
        ) : null}
      </form>

      <ReservationTable
        rows={rows}
        slug={slug}
        timeZone={tz}
        showDate={range !== "day" || !!q}
        empty={q ? "Keine Reservierung gefunden." : "Für diesen Zeitraum gibt es keine Reservierungen."}
      />
    </>
  );
}

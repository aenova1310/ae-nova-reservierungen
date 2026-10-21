import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { STATUS_BAR, statusLabel } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateLong, formatTime } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { dayBounds } from "@/server/admin/reservations";
import { loadRestaurantConfig } from "@/server/availability/load";
import { openingWindowsFor } from "@/server/availability/slots";
import { addDaysToDate, isLocalDate, localToUtc, utcToLocalDate } from "@/server/availability/time";
import { db } from "@/server/db";
import { getAdminT } from "@/server/i18n";
import { requireRestaurantAccess } from "@/server/tenancy/access";

/** Tagesplan: eine Zeile pro Tisch, Reservierungen als Balken (inkl. Puffer). */
export default async function TimelinePage(props: PageProps<"/admin/[restaurant]/timeline">) {
  const { restaurant: slug } = await props.params;
  const sp = await props.searchParams;
  const { restaurant, tdb } = await requireRestaurantAccess(slug);
  const { t, locale } = await getAdminT();
  const tz = restaurant.timezone;
  const today = utcToLocalDate(new Date(), tz);
  const date = typeof sp.date === "string" && isLocalDate(sp.date) ? sp.date : today;

  const config = await loadRestaurantConfig(db, restaurant.id);
  const { windows, closedBy } = openingWindowsFor(date, config.shifts, config.exceptions, config.rules.slotIntervalMinutes);

  // Sichtbarer Zeitraum: Öffnungszeiten des Tages (volle Stunden), sonst 11–23 Uhr
  const startMin = windows.length ? Math.floor(Math.min(...windows.map((w) => w.startMin)) / 60) * 60 : 11 * 60;
  const endMin = windows.length ? Math.ceil(Math.max(...windows.map((w) => w.endMin)) / 60) * 60 : 23 * 60;
  const windowStart = localToUtc(date, startMin, tz) ?? dayBounds(date, tz).from;
  const windowEnd = localToUtc(date, endMin, tz) ?? dayBounds(date, tz).to;
  const span = windowEnd.getTime() - windowStart.getTime();
  const pct = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - windowStart.getTime()) / span) * 100));

  const [areas, occupancies] = await Promise.all([
    tdb.area.findMany({ orderBy: { sortOrder: "asc" }, include: { tables: { where: { active: true }, orderBy: { sortOrder: "asc" } } } }),
    tdb.reservationTable.findMany({
      where: { startsAt: { lt: windowEnd }, blockedUntil: { gt: windowStart }, reservation: { status: { in: ["PENDING_PAYMENT", "REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW"] } } },
      include: { reservation: { select: { id: true, guestName: true, partySize: true, status: true, endsAt: true, code: true } } },
    }),
  ]);
  const byTable = new Map<string, typeof occupancies>();
  for (const o of occupancies) byTable.set(o.tableId, [...(byTable.get(o.tableId) ?? []), o]);

  const hours: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hours.push(m);
  const now = new Date();
  const showNow = now > windowStart && now < windowEnd;

  return (
    <>
      <PageHeader
        title={t("res.timeline.title")}
        description={closedBy ? t("res.timeline.closed", { date: formatDateLong(dayBounds(date, tz).from, locale, tz) }) : formatDateLong(dayBounds(date, tz).from, locale, tz)}
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

      <div className="overflow-x-auto rounded-lg border bg-card">
        <div className="min-w-[860px]">
          {/* Stundenleiste */}
          <div className="relative ml-28 h-8 border-b text-xs text-muted-foreground" aria-hidden>
            {hours.map((m, i) => (
              <span
                key={m}
                className={cn("tabular absolute top-2", i === 0 ? "" : i === hours.length - 1 ? "-translate-x-full pr-1" : "-translate-x-1/2")}
                style={{ left: `${((m - startMin) / (endMin - startMin)) * 100}%` }}
              >
                {String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {areas.map((area) => (
            <section key={area.id} aria-label={area.name}>
              <h2 className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">{area.name}</h2>
              {area.tables.map((table) => (
                <div key={table.id} className="flex border-b last:border-b-0">
                  <div className="w-28 shrink-0 border-r px-3 py-2 text-sm">
                    <span className="font-medium">{table.name}</span>
                    <span className="ml-1 text-xs text-muted-foreground">{table.minCapacity}–{table.maxCapacity}</span>
                  </div>
                  <div className="relative h-12 flex-1">
                    {hours.map((m) => (
                      <span key={m} aria-hidden className="absolute inset-y-0 border-l border-dashed border-border/70" style={{ left: `${((m - startMin) / (endMin - startMin)) * 100}%` }} />
                    ))}
                    {showNow ? <span aria-hidden className="absolute inset-y-0 z-10 w-px bg-bordeaux" style={{ left: `${pct(now)}%` }} /> : null}
                    {(byTable.get(table.id) ?? []).map((o) => {
                      const r = o.reservation;
                      const left = pct(o.startsAt);
                      const width = Math.max(1.5, pct(r.endsAt) - left);
                      const bufferWidth = Math.max(0, pct(o.blockedUntil) - pct(r.endsAt));
                      const label = t("res.timeline.barLabel", {
                        from: formatTime(o.startsAt, locale, tz),
                        to: formatTime(r.endsAt, locale, tz),
                        name: r.guestName ?? "–",
                        size: r.partySize,
                        status: statusLabel(t, r.status),
                      });
                      return (
                        <span key={o.id}>
                          <Link
                            href={`/admin/${slug}/reservierungen/${r.id}`}
                            aria-label={label}
                            title={label}
                            className={cn(
                              "absolute top-1.5 bottom-1.5 z-20 flex items-center overflow-hidden rounded-sm border-l-[3px] px-2 text-xs whitespace-nowrap hover:brightness-95 focus-visible:z-30",
                              STATUS_BAR[r.status],
                              !o.active && "opacity-50",
                            )}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          >
                            <span className="tabular mr-1.5">{formatTime(o.startsAt, locale, tz)}</span>
                            <span className="truncate font-medium">{r.guestName ?? r.code}</span>
                            <span className="ml-1.5">{r.partySize}</span>
                          </Link>
                          {bufferWidth > 0 ? (
                            <span
                              aria-hidden
                              title={t("res.timeline.buffer")}
                              className="absolute top-3 bottom-3 rounded-r-sm bg-[repeating-linear-gradient(135deg,var(--border)_0_3px,transparent_3px_6px)]"
                              style={{ left: `${left + width}%`, width: `${bufferWidth}%` }}
                            />
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(["REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("inline-block size-3 rounded-sm border-l-[3px]", STATUS_BAR[s])} aria-hidden />
            {statusLabel(t, s)}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-4 bg-[repeating-linear-gradient(135deg,var(--border)_0_3px,transparent_3px_6px)]" aria-hidden />
          {t("res.timeline.buffer")}
        </span>
        {showNow ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-px bg-bordeaux" aria-hidden /> {t("res.timeline.now")}
          </span>
        ) : null}
      </p>
    </>
  );
}

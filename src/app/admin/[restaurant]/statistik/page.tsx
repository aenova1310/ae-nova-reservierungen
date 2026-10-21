import Link from "next/link";
import { BarChart, type BarDatum } from "@/components/admin/charts/bar-chart";
import { Heatmap } from "@/components/admin/charts/heatmap";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { dateFormat, formatNumber } from "@/i18n/admin/format";
import { cn } from "@/lib/utils";
import { localToUtc, addDaysToDate, utcToLocalDate } from "@/server/availability/time";
import { getAdminT } from "@/server/i18n";
import { hasFeature } from "@/server/plans/features";
import { fillPeriods, guestsByWeekdayHour, startOfPeriod, statsByPeriod, summarize, type Granularity, type PeriodRow } from "@/server/stats/queries";
import { requireRestaurantAccess } from "@/server/tenancy/access";

const RANGES = {
  "12w": { granularity: "week" as Granularity, days: 84 },
  "6m": { granularity: "month" as Granularity, days: 183 },
  "12m": { granularity: "month" as Granularity, days: 365 },
};
type RangeKey = keyof typeof RANGES;

export default async function StatisticsPage(props: PageProps<"/admin/[restaurant]/statistik">) {
  const { restaurant: slug } = await props.params;
  const sp = await props.searchParams;
  const { restaurant } = await requireRestaurantAccess(slug);
  const { t, locale } = await getAdminT();
  const pct = (v: number | null) => (v === null ? "–" : `${formatNumber(v * 100, locale, { maximumFractionDigits: 1 })} %`);
  const num = (v: number) => formatNumber(v, locale);

  if (!hasFeature(restaurant.planCode, "statistics")) {
    return (
      <>
        <PageHeader title={t("nav.stats")} />
        <Section title={t("common.proOnly")}>
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("stats.proText")} {t("common.proUpsell")}
          </p>
        </Section>
      </>
    );
  }

  const rangeKey: RangeKey = typeof sp.range === "string" && sp.range in RANGES ? (sp.range as RangeKey) : "12w";
  const range = RANGES[rangeKey];
  const tz = restaurant.timezone;
  const today = utcToLocalDate(new Date(), tz);
  // Zeitraum endet mit dem laufenden Zeitraum (inkl. heute); Vergleich: gleich langer Zeitraum davor
  const fromKey = startOfPeriod(new Date(`${addDaysToDate(today, -range.days + 1)}T00:00:00Z`), range.granularity).toISOString().slice(0, 10);
  const prevFromKey = addDaysToDate(fromKey, -range.days);
  const from = localToUtc(fromKey, 0, tz)!;
  const prevFrom = localToUtc(prevFromKey, 0, tz)!;
  const to = localToUtc(addDaysToDate(today, 1), 0, tz)!;

  const [rows, prevRows, heat] = await Promise.all([
    statsByPeriod(restaurant, range.granularity, from, to),
    statsByPeriod(restaurant, range.granularity, prevFrom, from),
    guestsByWeekdayHour(restaurant, from, to),
  ]);
  const periods = fillPeriods(rows, range.granularity, fromKey, today);
  const cur = summarize(periods);
  const prev = summarize(prevRows);

  const periodLabel = (p: PeriodRow, long = false) => {
    const d = new Date(`${p.period}T12:00:00Z`);
    if (range.granularity === "month") {
      return dateFormat(locale, { month: long ? "long" : "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" }).format(d);
    }
    const end = new Date(d.getTime() + 6 * 86_400_000);
    const f = dateFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
    return long ? t("stats.week", { from: f.format(d), to: f.format(end) }) : f.format(d);
  };
  const series = (value: (p: PeriodRow) => number | null, display: (p: PeriodRow) => string, detail?: (p: PeriodRow) => string): BarDatum[] =>
    periods.map((p) => ({ key: p.period, label: periodLabel(p), fullLabel: periodLabel(p, true), value: value(p), display: display(p), detail: detail?.(p) }));

  const delta = (a: number | null, b: number | null, isRate = false) => {
    if (a === null || b === null || (!isRate && b === 0)) return null;
    const diff = isRate ? (a - b) * 100 : ((a - b) / b) * 100;
    return { text: `${diff > 0 ? "+" : ""}${formatNumber(diff, locale, { maximumFractionDigits: 1 })}${isRate ? ` ${t("stats.pp")}` : " %"}`, up: diff > 0 };
  };

  const kpis = [
    { label: t("stats.kpi.reservations"), value: num(cur.reservations), delta: delta(cur.reservations, prev.reservations) },
    { label: t("stats.kpi.guests"), value: num(cur.guests), delta: delta(cur.guests, prev.guests) },
    { label: t("stats.kpi.noShowRate"), value: pct(cur.noShowRate), delta: delta(cur.noShowRate, prev.noShowRate, true), lowerIsBetter: true },
    { label: t("stats.kpi.onlineShare"), value: pct(cur.onlineShare), delta: delta(cur.onlineShare, prev.onlineShare, true) },
    { label: t("stats.kpi.avgParty"), value: cur.avgPartySize === null ? "–" : formatNumber(cur.avgPartySize, locale, { maximumFractionDigits: 1 }), delta: null },
    { label: t("stats.kpi.cancellations"), value: num(cur.cancellations), delta: delta(cur.cancellations, prev.cancellations), lowerIsBetter: true },
  ];

  return (
    <>
      <PageHeader
        title={t("nav.stats")}
        description={t("stats.description")}
        actions={
          <div className="flex gap-1" role="group" aria-label={t("stats.range")}>
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <Button key={k} asChild size="sm" variant={k === rangeKey ? "secondary" : "ghost"} aria-current={k === rangeKey ? "true" : undefined}>
                <Link href={`?range=${k}`}>{t(`stats.range.${k}`)}</Link>
              </Button>
            ))}
          </div>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => {
          const good = k.delta ? (k.lowerIsBetter ? !k.delta.up : k.delta.up) : null;
          return (
            <div key={k.label} className="bg-card px-4 py-4">
              <dt className="text-sm text-muted-foreground">{k.label}</dt>
              <dd className="tabular mt-1 text-2xl font-medium">{k.value}</dd>
              {k.delta ? (
                <dd className={cn("tabular mt-0.5 text-xs", good ? "text-salbei" : "text-bordeaux")}>
                  {k.delta.up ? "▲" : "▼"} {k.delta.text} <span className="text-muted-foreground">{t("stats.vsPrevious")}</span>
                </dd>
              ) : null}
            </div>
          );
        })}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t(range.granularity === "week" ? "stats.perWeek" : "stats.perMonth")}>
          <div className="space-y-8">
            <BarChart
              title={t("stats.kpi.reservations")}
              data={series(
                (p) => p.reservations,
                (p) => t("stats.nReservations", { n: num(p.reservations), count: p.reservations }),
                (p) => t("stats.onlineWalkIns", { online: num(p.online), walkIns: num(p.walkIns) }),
              )}
            />
            <BarChart title={t("stats.kpi.guests")} data={series((p) => p.guests, (p) => t("stats.nGuests", { n: num(p.guests), count: p.guests }))} />
          </div>
        </Section>
        <Section title={t("stats.reliability")} description={t("stats.reliabilityHelp")}>
          <div className="space-y-8">
            <BarChart
              title={t("stats.kpi.noShowRate")}
              axis="percent"
              data={series(
                (p) => (p.settled > 0 ? p.noShows / p.settled : null),
                (p) => (p.settled > 0 ? pct(p.noShows / p.settled) : t("stats.noSettled")),
                (p) => t("stats.xOfY", { x: num(p.noShows), y: num(p.settled) }),
              )}
            />
            <BarChart
              title={t("stats.kpi.cancellations")}
              data={series((p) => p.cancellations, (p) => t("stats.nCancellations", { n: num(p.cancellations), count: p.cancellations }))}
            />
          </div>
        </Section>
      </div>

      <div className="mt-6">
        <Section title={t("stats.heatTitle")} description={t("stats.heatHelp")}>
          <Heatmap cells={heat} title={t("stats.heatChart")} />
        </Section>
      </div>

      <details className="mt-6 rounded-lg border bg-card">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">{t("stats.tableView")}</summary>
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 font-medium">{t("stats.col.period")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("stats.col.reservations")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("stats.col.guests")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("stats.col.online")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("stats.col.walkIns")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("stats.col.noShows")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("stats.col.rate")}</th>
                <th scope="col" className="py-2 text-right font-medium">{t("stats.col.cancellations")}</th>
              </tr>
            </thead>
            <tbody className="tabular divide-y">
              {periods.map((p) => (
                <tr key={p.period}>
                  <th scope="row" className="py-1.5 text-left font-normal">{periodLabel(p, true)}</th>
                  <td className="py-1.5 text-right">{num(p.reservations)}</td>
                  <td className="py-1.5 text-right">{num(p.guests)}</td>
                  <td className="py-1.5 text-right">{num(p.online)}</td>
                  <td className="py-1.5 text-right">{num(p.walkIns)}</td>
                  <td className="py-1.5 text-right">{num(p.noShows)}</td>
                  <td className="py-1.5 text-right">{p.settled ? pct(p.noShows / p.settled) : "–"}</td>
                  <td className="py-1.5 text-right">{num(p.cancellations)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

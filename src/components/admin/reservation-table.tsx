import Link from "next/link";
import { intlLocale } from "@/i18n/admin/format";
import { formatTime } from "@/i18n/messages";
import type { ReservationRow } from "@/server/admin/reservations";
import { getAdminT } from "@/server/i18n";
import { allowedTransitions, type ReservationStatus } from "@/server/reservations/status";
import { changeStatusAction } from "@/app/admin/[restaurant]/reservierungen/actions";
import { sourceLabel, StatusBadge } from "./status-badge";
import { StatusActions } from "./status-actions";

/** Reservierungsliste (Server-Komponente) mit Schnellaktionen. */
export async function ReservationTable({
  rows,
  slug,
  timeZone,
  showDate = false,
  empty,
}: {
  rows: ReservationRow[];
  slug: string;
  timeZone: string;
  showDate?: boolean;
  empty: string;
}) {
  const { t, locale } = await getAdminT();
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed bg-card px-5 py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  const dateFmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "2-digit", month: "2-digit", timeZone });
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">{t("res.table.time")}</th>
            <th scope="col" className="px-4 py-2.5 font-medium">{t("res.table.guest")}</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">{t("res.table.partySize")}</th>
            <th scope="col" className="px-4 py-2.5 font-medium">{t("res.f.table")}</th>
            <th scope="col" className="px-4 py-2.5 font-medium">{t("res.f.status")}</th>
            <th scope="col" className="px-4 py-2.5 font-medium">{t("res.table.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const allowed = allowedTransitions(r.status as ReservationStatus).filter((s) => s !== "CONFIRMED" || r.status === "REQUESTED");
            return (
              <tr key={r.id} className="align-middle hover:bg-muted/30">
                <td className="tabular px-4 py-2.5 whitespace-nowrap">
                  {showDate ? <span className="mr-2 text-muted-foreground">{dateFmt.format(r.startsAt)}</span> : null}
                  <span className="font-medium">{formatTime(r.startsAt, locale, timeZone)}</span>
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/admin/${slug}/reservierungen/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.guestName ?? t("res.anonymized")}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {sourceLabel(t, r.source)} · {r.code}
                    {r.guestNotes ? ` · ${t("res.table.hasNote")}` : ""}
                  </span>
                </td>
                <td className="tabular px-4 py-2.5 text-right">{r.partySize}</td>
                <td className="px-4 py-2.5">{r.tables.map((t) => t.table.name).join(" + ") || "–"}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2.5">
                  <StatusActions
                    current={r.status}
                    allowed={allowed}
                    onChange={changeStatusAction.bind(null, slug, r.id) as (to: string) => ReturnType<typeof changeStatusAction>}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { buildIcs } from "@/server/email/ics";
import { jsonError } from "@/server/http/request";
import { findReservationByToken } from "@/server/reservations/manage";

/** GET /api/public/manage/:token/ics – Kalenderdatei zur Reservierung. */
export async function GET(_request: Request, ctx: RouteContext<"/api/public/manage/[token]/ics">) {
  const { token } = await ctx.params;
  const r = await findReservationByToken(token);
  if (!r || r.anonymizedAt) return jsonError("NOT_FOUND", 404);
  const ics = buildIcs({
    uid: `${r.id}@ae-nova`,
    sequence: r.icsSequence,
    start: r.startsAt,
    end: r.endsAt,
    summary: `${r.restaurant.name} – ${r.partySize} Pers.`,
    location: r.restaurant.name,
    organizerName: r.restaurant.name,
    organizerEmail: r.restaurant.email,
    cancelled: ["CANCELLED", "DECLINED", "EXPIRED"].includes(r.status),
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="reservierung-${r.code}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}

import { after, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { rateLimit } from "@/server/auth/rate-limit";
import { isLocalDate, isLocalTime } from "@/server/availability/time";
import { dispatchEmails } from "@/server/email/outbox";
import { clientKey, jsonError } from "@/server/http/request";
import { createReservation } from "@/server/reservations/create";
import { httpStatusFor, ReservationError } from "@/server/reservations/errors";

const body = z.object({
  date: z.string().refine(isLocalDate),
  time: z.string().refine(isLocalTime),
  partySize: z.number().int().min(1).max(50),
  areaId: z.string().max(40).nullish(),
  choice: z.object({ kind: z.enum(["table", "combination"]), id: z.string().max(40) }).nullish(),
  guest: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().regex(/^[+()0-9\s/-]{6,30}$/),
    notes: z.string().trim().max(1000).nullish(),
  }),
  locale: z.enum(["de", "en"]).default("de"),
  privacyAcknowledged: z.literal(true),
  /** Honeypot-Feld: bleibt bei Menschen leer. */
  website: z.string().max(0).optional(),
});

/** POST /api/public/:slug/reservations – Online-Reservierung anlegen. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/public/[slug]/reservations">) {
  const { slug } = await ctx.params;

  const limit = rateLimit(clientKey(request, `book:${slug}`), 10, 10 * 60_000);
  if (!limit.ok) return jsonError("RATE_LIMIT", 429, { retryAfterMs: limit.retryAfterMs });

  const json = await request.json().catch(() => null);
  const parsed = body.safeParse(json);
  if (!parsed.success) {
    return jsonError("VALIDATION", 400, { fields: parsed.error.issues.map((i) => i.path.join(".")) });
  }

  const restaurant = await db.restaurant.findUnique({ where: { slug }, select: { id: true } });
  if (!restaurant) return jsonError("NOT_FOUND", 404);

  try {
    const created = await createReservation({
      restaurantId: restaurant.id,
      date: parsed.data.date,
      time: parsed.data.time,
      partySize: parsed.data.partySize,
      channel: "ONLINE",
      source: "ONLINE",
      areaId: parsed.data.areaId ?? null,
      choice: parsed.data.choice ?? null,
      guest: parsed.data.guest,
      locale: parsed.data.locale,
      privacyAcknowledged: parsed.data.privacyAcknowledged,
    });
    // Mails nach dem Senden der Antwort verschicken (Outbox – fehlgeschlagene holt der Cron-Job nach)
    after(() => dispatchEmails(created.emailIds));
    return Response.json(
      {
        code: created.code,
        status: created.status,
        startsAt: created.startsAt.toISOString(),
        endsAt: created.endsAt.toISOString(),
        tableNames: created.tableNames,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ReservationError) return jsonError(error.code, httpStatusFor(error.code));
    console.error("[booking] unerwarteter Fehler", error);
    return jsonError("INTERNAL", 500);
  }
}

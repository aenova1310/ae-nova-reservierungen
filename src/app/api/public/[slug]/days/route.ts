import type { NextRequest } from "next/server";
import { z } from "zod";
import { isLocalDate } from "@/server/availability/time";
import { jsonError } from "@/server/http/request";
import { getPublicDays } from "@/server/public/widget";

const query = z.object({
  from: z.string().refine(isLocalDate),
  party: z.coerce.number().int().min(1).max(50),
  days: z.coerce.number().int().min(1).max(62).default(42),
});

/** GET /api/public/:slug/days?from=YYYY-MM-DD&party=2 – Tage mit freien Slots (Kalender). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/public/[slug]/days">) {
  const { slug } = await ctx.params;
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return jsonError("INVALID_QUERY", 400);
  const result = await getPublicDays(slug, parsed.data.from, parsed.data.party, parsed.data.days);
  if (!result) return jsonError("NOT_FOUND", 404);
  return Response.json({ days: result }, { headers: { "Cache-Control": "no-store" } });
}

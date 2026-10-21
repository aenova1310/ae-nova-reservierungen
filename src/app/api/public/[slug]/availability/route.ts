import type { NextRequest } from "next/server";
import { z } from "zod";
import { isLocalDate } from "@/server/availability/time";
import { jsonError } from "@/server/http/request";
import { getPublicAvailability } from "@/server/public/widget";

const query = z.object({
  date: z.string().refine(isLocalDate),
  party: z.coerce.number().int().min(1).max(50),
});

/** GET /api/public/:slug/availability?date=YYYY-MM-DD&party=2 – freie Slots eines Tages. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/public/[slug]/availability">) {
  const { slug } = await ctx.params;
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return jsonError("INVALID_QUERY", 400);
  const result = await getPublicAvailability(slug, parsed.data.date, parsed.data.party);
  if (!result) return jsonError("NOT_FOUND", 404);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

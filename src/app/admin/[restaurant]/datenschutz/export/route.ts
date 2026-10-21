import { z } from "zod";
import { exportGuestData } from "@/server/privacy/anonymize";
import { requireRestaurantAccess } from "@/server/tenancy/access";

/** GET /admin/:restaurant/datenschutz/export?email=… – Datenauskunft als JSON-Download (nur Inhaber). */
export async function GET(request: Request, ctx: RouteContext<"/admin/[restaurant]/datenschutz/export">) {
  const { restaurant: slug } = await ctx.params;
  const { restaurant, user } = await requireRestaurantAccess(slug, { ownerOnly: true });
  const email = z.string().email().safeParse(new URL(request.url).searchParams.get("email"));
  if (!email.success) return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  const data = await exportGuestData(restaurant.id, email.data, user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="datenauskunft-${slug}-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

import { z } from "zod";
import { env } from "@/server/env";
import { jsonError } from "@/server/http/request";
import { FeatureNotInPlanError } from "@/server/plans/features";
import { MediaError, removeLogo, removeTableMedia, updateTableMediaAlt, uploadLogo, uploadTableMedia } from "@/server/media/service";
import { rateLimit } from "@/server/auth/rate-limit";
import { getSessionUser } from "@/server/auth/session";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { revalidatePath } from "next/cache";
import { formatMb, MEDIA_LIMITS } from "@/lib/media-limits";

/**
 * Upload/Verwaltung von Medien im Admin (multipart/form-data).
 * Route statt Server Action, weil Uploads größer als das Action-Limit (1 MB) sind.
 *
 * Schutz: Session-Cookie (SameSite=Lax) + Prüfung des Origin-Headers gegen APP_URL
 * (CSRF), Rollenprüfung, Tarif-Gate, Tisch-Zugehörigkeit, Rate-Limit.
 */
const fields = z.object({
  restaurant: z.string().min(1).max(60),
  target: z.enum(["logo", "table"]),
  action: z.enum(["upload", "remove", "alt"]).default("upload"),
  tableId: z.string().max(40).optional(),
  kind: z.enum(["PHOTO", "PANORAMA_360"]).optional(),
  altDe: z.string().max(200).optional(),
  altEn: z.string().max(200).optional(),
});

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new URL(env().APP_URL).origin;
  // In der Entwicklung zusätzlich den tatsächlichen Host akzeptieren (z. B. 127.0.0.1 statt localhost)
  return origin === allowed || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("FORBIDDEN_ORIGIN", 403);
  // API: 401 statt Weiterleitung zur Login-Seite
  const sessionUser = await getSessionUser();
  if (!sessionUser) return jsonError("UNAUTHENTICATED", 401, { message: "Bitte erneut anmelden." });

  // Größe und Rate-Limit prüfen, BEVOR der Body in den Speicher gelesen wird
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) return jsonError("LENGTH_REQUIRED", 411);
  if (length > MEDIA_LIMITS.requestBytes) {
    return jsonError("TOO_LARGE", 413, { message: `Die Datei ist zu groß (max. ${formatMb(MEDIA_LIMITS.panoramaBytes)}).` });
  }
  const limit = rateLimit(`media:${sessionUser.id}`, 30, 10 * 60_000);
  if (!limit.ok) return jsonError("RATE_LIMIT", 429, { message: "Zu viele Uploads. Bitte kurz warten." });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("INVALID_FORM", 400);
  }
  const parsed = fields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return jsonError("INVALID_FORM", 400);
  const f = parsed.data;

  // Logo nur für Inhaber; Tischmedien auch für Mitarbeiter (Tische dürfen sie pflegen)
  const { restaurant, user } = await requireRestaurantAccess(f.restaurant, { ownerOnly: f.target === "logo" });

  try {
    if (f.target === "logo") {
      if (f.action === "remove") await removeLogo(restaurant, user.id);
      else {
        const file = await fileFrom(form);
        const result = await uploadLogo(restaurant, file, user.id);
        refresh(restaurant.slug);
        return Response.json(result);
      }
    } else {
      if (!f.tableId) return jsonError("INVALID_FORM", 400);
      if (f.action === "remove") await removeTableMedia(restaurant, f.tableId, user.id);
      else if (f.action === "alt") await updateTableMediaAlt(restaurant, f.tableId, f.altDe ?? null, f.altEn ?? null);
      else {
        const file = await fileFrom(form);
        const result = await uploadTableMedia({
          restaurant,
          tableId: f.tableId,
          kind: f.kind ?? "PHOTO",
          file,
          altDe: f.altDe,
          altEn: f.altEn,
          userId: user.id,
        });
        refresh(restaurant.slug);
        return Response.json(result);
      }
    }
    refresh(restaurant.slug);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof MediaError) return jsonError("MEDIA", 422, { message: error.message });
    if (error instanceof FeatureNotInPlanError) {
      return jsonError("FEATURE_NOT_IN_PLAN", 403, { message: "Die Tischansicht ist im Pro-Tarif enthalten." });
    }
    console.error("[media] Upload fehlgeschlagen", error);
    return jsonError("INTERNAL", 500, { message: "Upload fehlgeschlagen. Bitte erneut versuchen." });
  }
}

async function fileFrom(form: FormData): Promise<Buffer> {
  const file = form.get("file");
  if (!(file instanceof File)) throw new MediaError("Bitte eine Bilddatei auswählen.");
  // Vor dem Einlesen grob begrenzen (genaue Grenzen je Medienart in process.ts)
  if (file.size > MEDIA_LIMITS.panoramaBytes) throw new MediaError(`Die Datei ist zu groß (max. ${formatMb(MEDIA_LIMITS.panoramaBytes)}).`);
  return Buffer.from(await file.arrayBuffer());
}

function refresh(slug: string) {
  revalidatePath(`/admin/${slug}`, "layout");
  revalidatePath(`/r/${slug}`);
  revalidatePath(`/embed/${slug}`);
}

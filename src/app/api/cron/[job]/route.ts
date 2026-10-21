import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { JOBS, type JobName } from "@/server/jobs";

/**
 * POST /api/cron/:job – Hintergrundjob ausführen.
 * Absicherung: Header `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/cron/[job]">) {
  const { job } = await ctx.params;
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(job in JOBS)) return Response.json({ error: "UNKNOWN_JOB" }, { status: 404 });
  const started = Date.now();
  const result = await JOBS[job as JobName]();
  return Response.json({ job, ok: true, durationMs: Date.now() - started, result });
}

/** GET für Scheduler, die nur GET können (z. B. Vercel Cron) – gleiche Absicherung. */
export const GET = POST;

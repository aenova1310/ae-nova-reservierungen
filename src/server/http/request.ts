import "server-only";
import { createHash } from "node:crypto";

/**
 * Anonymer Schlüssel für Rate-Limits: Hash aus IP und Tagesdatum.
 * Die IP-Adresse selbst wird nirgends gespeichert oder geloggt.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${scope}:${ip}:${day}`).digest("hex").slice(0, 32);
}

export function jsonError(code: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

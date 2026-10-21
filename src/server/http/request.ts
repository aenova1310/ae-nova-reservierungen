import "server-only";
import { createHash } from "node:crypto";

/**
 * Anonymer Schlüssel für Rate-Limits: Hash aus IP und Tagesdatum.
 * Die IP-Adresse selbst wird nirgends gespeichert oder geloggt.
 */
export function clientKey(request: Request, scope: string): string {
  const ip = clientIp(request.headers);
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${scope}:${ip}:${day}`).digest("hex").slice(0, 32);
}

/**
 * Client-IP hinter genau EINEM vertrauenswürdigen Reverse-Proxy (Caddy/Traefik/Coolify):
 * der LETZTE Eintrag von `X-Forwarded-For` – den hängt der Proxy an. Frühere
 * Einträge (und `X-Real-IP`, das Caddy nicht überschreibt) kann der Client fälschen.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? headers.get("x-real-ip")?.trim() ?? "unknown";
}

export function jsonError(code: string, status: number, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

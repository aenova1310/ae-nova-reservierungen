import "server-only";

/**
 * Einfaches In-Memory-Rate-Limit (Fixed Window) pro Schlüssel.
 * Ausreichend für eine einzelne App-Instanz. Bei mehreren Instanzen durch eine
 * Variante mit Postgres- oder Redis-Speicher ersetzen (gleiche Signatur).
 * Schlüssel sollten gehasht übergeben werden – keine IP-Adressen im Klartext halten.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, retryAfterMs: 0 };
  }
  bucket.count += 1;
  return bucket.count <= limit ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: bucket.resetAt - now };
}

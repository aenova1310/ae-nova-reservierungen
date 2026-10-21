import "server-only";
import { z } from "zod";

/**
 * Zentral validierte Umgebungsvariablen. Fehlt etwas Pflichtiges, bricht der
 * Server beim ersten Zugriff mit einer klaren Meldung ab statt später irgendwo.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Geheimnis für HMAC-signierte Verwaltungslinks (mind. 32 Zeichen). */
  APP_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(8),
  EMAIL_FROM: z.string().min(3).default("A&E NOVA Reservierungen <reservierung@localhost>"),
  RESEND_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        "Ungültige Umgebungsvariablen: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    cached = parsed.data;
  }
  return cached;
}

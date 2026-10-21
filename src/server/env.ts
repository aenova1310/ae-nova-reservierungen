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
  /** Medien-Speicher: "local" (Entwicklung, Dateisystem) oder "s3" (Hetzner Object Storage, MinIO, …) */
  MEDIA_DRIVER: z.enum(["local", "s3"]).default("local"),
  MEDIA_LOCAL_DIR: z.string().default(".media"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("eu-central"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) {
    // Leere Werte (z. B. `S3_ENDPOINT=""` aus .env.example) gelten als nicht gesetzt
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ""));
    const parsed = schema.safeParse(raw);
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

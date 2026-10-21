import { afterEach, describe, expect, it, vi } from "vitest";

const BASE = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  APP_SECRET: "x".repeat(40),
  CRON_SECRET: "cron-secret",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Umgebungsvariablen", () => {
  it("behandelt leere Werte aus .env.example als nicht gesetzt", async () => {
    for (const [k, v] of Object.entries({ ...BASE, S3_ENDPOINT: "", S3_BUCKET: "", RESEND_API_KEY: "  " })) vi.stubEnv(k, v);
    const { env } = await import("@/server/env");
    const e = env();
    expect(e.S3_ENDPOINT).toBeUndefined();
    expect(e.RESEND_API_KEY).toBeUndefined();
    expect(e.MEDIA_DRIVER).toBe("local");
  });

  it("meldet echte Fehler weiterhin klar", async () => {
    for (const [k, v] of Object.entries({ ...BASE, S3_ENDPOINT: "kein-url" })) vi.stubEnv(k, v);
    const { env } = await import("@/server/env");
    expect(() => env()).toThrow(/S3_ENDPOINT/);
  });
});

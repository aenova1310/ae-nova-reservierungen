import { CreateBucketCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";

/**
 * Prüft den S3-Treiber gegen einen echten S3-kompatiblen Server
 * (z. B. MinIO oder moto). Läuft nur, wenn S3_TEST_ENDPOINT gesetzt ist:
 *   S3_TEST_ENDPOINT=http://localhost:9100 npm run test:integration
 */
const endpoint = process.env.S3_TEST_ENDPOINT;

describe.skipIf(!endpoint)("S3-Treiber", () => {
  it("speichert, liest und löscht Objekte mit korrektem Content-Type und Cache-Header", async () => {
    Object.assign(process.env, {
      MEDIA_DRIVER: "s3",
      S3_ENDPOINT: endpoint,
      S3_REGION: "eu-central",
      S3_BUCKET: "nova-test",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
    });
    const raw = new S3Client({ endpoint, region: "eu-central", forcePathStyle: true, credentials: { accessKeyId: "test", secretAccessKey: "test" } });
    await raw.send(new CreateBucketCommand({ Bucket: "nova-test" })).catch(() => undefined);

    const { mediaStorage, setMediaStorage } = await import("@/server/media/storage");
    setMediaStorage(null);
    const storage = mediaStorage();
    const key = "r/cmvi9z3tq000n047d0l1kwpfb/logo/0123456789abcdef01234567.png";
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

    await storage.put(key, body, "image/png");
    const head = await raw.send(new GetObjectCommand({ Bucket: "nova-test", Key: key }));
    expect(head.ContentType).toBe("image/png");
    expect(head.CacheControl).toContain("immutable");

    const got = await storage.get(key);
    expect(got?.body.equals(body)).toBe(true);
    expect(got?.contentType).toBe("image/png");

    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    // Ungültige Schlüssel werden gar nicht erst angefragt
    expect(await storage.get("r/../../secret")).toBeNull();
    await expect(storage.put("r/../../secret", body, "image/png")).rejects.toThrow(/Ungültiger/);
  });
});

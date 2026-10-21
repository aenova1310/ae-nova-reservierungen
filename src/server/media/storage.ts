import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";

/**
 * Speicher für Medien (Logos, Tischfotos, 360°-Panoramen).
 *
 * Ausgeliefert wird immer über die eigene Domain (`/media/<key>`, siehe
 * src/app/media/[...key]/route.ts). Der Bucket bleibt privat, das Widget lädt
 * nichts von Drittanbietern, und der Speicher lässt sich ohne Änderung an
 * gespeicherten URLs wechseln.
 */
export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface MediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** Erlaubte Schlüssel: r/<id>/<bereich>/<datei>.<ext> – keine Pfadmanipulation möglich. */
const KEY_RE = /^r\/[a-z0-9]{10,40}\/(logo|tables\/[a-z0-9]{10,40})\/[a-f0-9]{16,64}(-thumb)?\.(webp|png|jpg)$/;

export function isValidMediaKey(key: string): boolean {
  return KEY_RE.test(key);
}

export function contentTypeFor(key: string): string {
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

class LocalStorage implements MediaStorage {
  constructor(private readonly root: string) {}

  private file(key: string) {
    if (!isValidMediaKey(key)) throw new Error(`Ungültiger Medien-Schlüssel: ${key}`);
    return path.join(this.root, ...key.split("/"));
  }

  async put(key: string, body: Buffer) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string) {
    const file = this.file(key);
    try {
      await stat(file);
    } catch {
      return null;
    }
    return { body: await readFile(file), contentType: contentTypeFor(key) };
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

class S3Storage implements MediaStorage {
  private client: S3Client;
  constructor(private readonly bucket: string) {
    const e = env();
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      // Hetzner/MinIO: Pfad-Stil statt virtueller Hosts
      forcePathStyle: true,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    if (!isValidMediaKey(key)) throw new Error(`Ungültiger Medien-Schlüssel: ${key}`);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }),
    );
  }

  async get(key: string) {
    if (!isValidMediaKey(key)) return null;
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      return { body: Buffer.from(await res.Body.transformToByteArray()), contentType: res.ContentType ?? contentTypeFor(key) };
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  }

  async delete(key: string) {
    if (!isValidMediaKey(key)) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let instance: MediaStorage | null = null;

export function mediaStorage(): MediaStorage {
  if (!instance) {
    const e = env();
    if (e.MEDIA_DRIVER === "s3") {
      if (!e.S3_BUCKET || !e.S3_ENDPOINT || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) {
        throw new Error("MEDIA_DRIVER=s3 benötigt S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID und S3_SECRET_ACCESS_KEY.");
      }
      instance = new S3Storage(e.S3_BUCKET);
    } else {
      instance = new LocalStorage(path.resolve(process.cwd(), e.MEDIA_LOCAL_DIR));
    }
  }
  return instance;
}

/** Für Tests: Speicher austauschen. */
export function setMediaStorage(storage: MediaStorage | null) {
  instance = storage;
}

/** Öffentliche URL (relativ, gleiche Domain) eines Schlüssels. */
export function mediaUrl(key: string): string {
  return `/media/${key}`;
}

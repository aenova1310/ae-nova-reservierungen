import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata, type Sharp } from "sharp";
import { MEDIA_LIMITS } from "@/lib/media-limits";

/**
 * Bildverarbeitung für Uploads.
 *
 * - Format wird aus den Bilddaten erkannt (nicht aus Dateiname/MIME-Typ).
 * - SVG ist nicht erlaubt (kann Skripte enthalten).
 * - EXIF-Ausrichtung wird angewendet, danach werden ALLE Metadaten entfernt
 *   (GPS-Position, Kamera, Zeitstempel) – sharp übernimmt Metadaten nur mit
 *   `.withMetadata()`, das hier bewusst nie verwendet wird.
 * - Ausgabe in festen Größen, damit das Widget auch mobil schnell lädt.
 */
export class MediaError extends Error {}

const LIMITS = MEDIA_LIMITS;

/**
 * Höchstens zwei Bilder gleichzeitig verarbeiten. Ein großes Panorama belegt
 * beim Dekodieren mehrere hundert MB – ohne Begrenzung könnten parallele
 * Uploads einen kleinen Server in den Speichermangel treiben.
 */
let running = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/**
 * Panoramen werden auf 4096 × 2048 begrenzt: Viele Mobilgeräte können keine
 * größeren WebGL-Texturen darstellen. Für höhere Auflösungen wäre das
 * Kachel-Plugin von Photo Sphere Viewer nötig.
 */
const PANORAMA_MAX_WIDTH = 4096;

const ALLOWED_INPUT = new Set(["jpeg", "png", "webp", "avif", "tiff"]);

export interface ProcessedImage {
  body: Buffer;
  width: number;
  height: number;
  contentType: "image/webp" | "image/png";
  ext: "webp" | "png";
  hash: string;
}

const hashOf = (buf: Buffer) => createHash("sha256").update(buf).digest("hex").slice(0, 24);

async function inspect(input: Buffer, maxBytes: number) {
  if (input.length === 0) throw new MediaError("Die Datei ist leer.");
  if (input.length > maxBytes) {
    throw new MediaError(`Die Datei ist zu groß (max. ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  }
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: LIMITS.maxInputPixels }).metadata();
  } catch {
    throw new MediaError("Die Datei ist kein lesbares Bild. Erlaubt sind JPG, PNG, WebP und AVIF.");
  }
  if (meta.format === "heif") {
    throw new MediaError("HEIC-Fotos (iPhone) bitte als JPG exportieren oder in den Kameraeinstellungen „Maximale Kompatibilität“ wählen.");
  }
  if (!meta.format || !ALLOWED_INPUT.has(meta.format)) {
    throw new MediaError("Dieses Bildformat wird nicht unterstützt. Erlaubt sind JPG, PNG, WebP und AVIF.");
  }
  if (!meta.width || !meta.height) throw new MediaError("Bildgröße konnte nicht ermittelt werden.");
  // Ausrichtung laut EXIF berücksichtigen (Hochformat-Fotos von Smartphones)
  const rotated = (meta.orientation ?? 1) >= 5;
  return { width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height };
}

const base = (input: Buffer) => sharp(input, { limitInputPixels: LIMITS.maxInputPixels }).rotate();

async function finish(pipeline: Sharp, kind: "webp" | "png"): Promise<ProcessedImage> {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    body: data,
    width: info.width,
    height: info.height,
    contentType: kind === "webp" ? "image/webp" : "image/png",
    ext: kind,
    hash: hashOf(data),
  };
}

/** Logo: max. 800 × 240 px, PNG mit Transparenz (funktioniert überall, auch in E-Mails). */
export async function processLogo(input: Buffer): Promise<ProcessedImage> {
  const { width, height } = await inspect(input, LIMITS.logoBytes);
  if (width < 32 || height < 16) throw new MediaError("Das Logo ist zu klein (mindestens 32 × 16 Pixel).");
  return withSlot(() =>
    finish(base(input).resize({ width: 800, height: 240, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }), "png"),
  );
}

export interface ProcessedMedia {
  main: ProcessedImage;
  thumb: ProcessedImage;
}

/** Tischfoto: max. 2000 px Kantenlänge (WebP), Vorschau 480 × 320. */
export async function processTablePhoto(input: Buffer): Promise<ProcessedMedia> {
  const { width, height } = await inspect(input, LIMITS.photoBytes);
  if (width < 400 || height < 300) throw new MediaError("Das Foto ist zu klein (mindestens 400 × 300 Pixel).");
  return withSlot(async () => {
    // Original nur EINMAL dekodieren; die Vorschau entsteht aus dem bereits verkleinerten Bild
    const main = await finish(base(input).resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }), "webp");
    const thumb = await finish(sharp(main.body).resize({ width: 480, height: 320, fit: "cover", position: "attention" }).webp({ quality: 75 }), "webp");
    return { main, thumb };
  });
}

/** 360°-Panorama (equirectangular, Seitenverhältnis 2:1): max. 4096 × 2048 (WebP). */
export async function processPanorama(input: Buffer): Promise<ProcessedMedia> {
  const { width, height } = await inspect(input, LIMITS.panoramaBytes);
  const ratio = width / height;
  if (ratio < 1.9 || ratio > 2.1) {
    throw new MediaError(
      `Ein 360°-Panorama muss doppelt so breit wie hoch sein (equirectangular, 2:1). Dieses Bild ist ${width} × ${height}. Für normale Fotos bitte „Foto“ wählen.`,
    );
  }
  if (width < 2000) throw new MediaError("Das Panorama ist zu klein (mindestens 2000 × 1000 Pixel).");
  return withSlot(async () => {
    const main = await finish(base(input).resize({ width: PANORAMA_MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }), "webp");
    // Vorschau: Ausschnitt aus der Bildmitte (Blickrichtung "vorne"), aus dem bereits
    // verkleinerten Panorama. sharp erlaubt nur eine Größenänderung je Kette.
    const scaled = await sharp(main.body).resize({ width: 1440 }).toBuffer();
    const thumb = await finish(
      sharp(scaled).extract({ left: 240, top: 120, width: 960, height: 480 }).resize({ width: 480, height: 320, fit: "cover" }).webp({ quality: 75 }),
      "webp",
    );
    return { main, thumb };
  });
}

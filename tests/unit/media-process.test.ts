import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import { MediaError, processLogo, processPanorama, processTablePhoto } from "@/server/media/process";
import { isValidMediaKey } from "@/server/media/storage";

/** Testbild mit Farbverlauf (damit Kompression realistisch arbeitet). */
async function image(width: number, height: number, format: "jpeg" | "png" = "jpeg", exif?: Parameters<Sharp["withExif"]>[0], orientation?: number) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 60 } } }).composite([
    { input: Buffer.from(`<svg width="${width}" height="${height}"><rect x="0" y="0" width="${width / 2}" height="${height}" fill="#1d2433"/></svg>`) },
  ]);
  if (format === "jpeg") img = img.jpeg({ quality: 90 });
  else img = img.png();
  if (exif) img = img.withExif(exif);
  let buf = await img.toBuffer();
  if (orientation) buf = await sharp(buf).withMetadata({ orientation }).jpeg().toBuffer();
  return buf;
}

describe("Bildverarbeitung", () => {
  it("entfernt GPS-Position und Kameradaten aus Fotos", async () => {
    const input = await image(1600, 1200, "jpeg", {
      IFD0: { Make: "TestCam", Model: "Geheimkamera 3000" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 31/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "13/1 24/1 0/1" },
    });
    const inMeta = await sharp(input).metadata();
    expect(inMeta.exif).toBeDefined(); // Testbild enthält wirklich EXIF

    const { main, thumb } = await processTablePhoto(input);
    for (const out of [main, thumb]) {
      const meta = await sharp(out.body).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(out.body.includes(Buffer.from("Geheimkamera"))).toBe(false);
    }
    expect(main.width).toBe(1600);
    expect(thumb.width).toBe(480);
    expect(thumb.height).toBe(320);
  });

  it("wendet die EXIF-Ausrichtung an (Hochformat-Fotos vom Smartphone)", async () => {
    const input = await image(1200, 800, "jpeg", undefined, 6); // gespeichert quer, soll hochkant sein
    const { main } = await processTablePhoto(input);
    expect(main.height).toBeGreaterThan(main.width);
  });

  it("verkleinert große Fotos auf max. 2000 px und vergrößert kleine nicht", async () => {
    const big = await processTablePhoto(await image(5000, 3000));
    expect(Math.max(big.main.width, big.main.height)).toBe(2000);
    const small = await processTablePhoto(await image(800, 600));
    expect(small.main.width).toBe(800);
  });

  it("akzeptiert nur Panoramen im Seitenverhältnis 2:1 und begrenzt sie auf 4096 px", async () => {
    await expect(processPanorama(await image(3000, 2000))).rejects.toThrow(/doppelt so breit/);
    const pano = await processPanorama(await image(6000, 3000));
    expect(pano.main.width).toBe(4096);
    expect(pano.main.height).toBe(2048);
    expect([pano.thumb.width, pano.thumb.height]).toEqual([480, 320]);
  });

  it("lehnt SVG, Nicht-Bilder, leere und zu kleine Dateien ab", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script></svg>');
    await expect(processLogo(svg)).rejects.toBeInstanceOf(MediaError);
    await expect(processTablePhoto(Buffer.from("kein bild"))).rejects.toThrow(/kein lesbares Bild/);
    await expect(processTablePhoto(Buffer.alloc(0))).rejects.toThrow(/leer/);
    await expect(processTablePhoto(await image(300, 200))).rejects.toThrow(/zu klein/);
  });

  it("lehnt zu große Dateien vor der Verarbeitung ab", async () => {
    await expect(processLogo(Buffer.alloc(4 * 1024 * 1024, 1))).rejects.toThrow(/zu groß/);
  });

  it("erzeugt Logos als PNG mit Transparenz, max. 800 × 240", async () => {
    const transparent = await sharp({ create: { width: 1600, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const logo = await processLogo(transparent);
    const meta = await sharp(logo.body).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    expect(logo.width).toBe(800);
    expect(logo.height).toBe(200);
  });

  it("erzeugt stabile Inhalts-Hashes (gleiches Bild → gleicher Schlüssel)", async () => {
    const input = await image(1000, 800);
    const [a, b] = await Promise.all([processTablePhoto(input), processTablePhoto(input)]);
    expect(a.main.hash).toBe(b.main.hash);
    expect(a.main.hash).toMatch(/^[a-f0-9]{24}$/);
  });
});

describe("Medien-Schlüssel", () => {
  it("erlaubt nur das feste Schema (kein Pfad-Trick)", () => {
    expect(isValidMediaKey("r/cmvi9z3tq000n047d0l1kwpfb/logo/0123456789abcdef01234567.png")).toBe(true);
    expect(isValidMediaKey("r/cmvi9z3tq000n047d0l1kwpfb/tables/cmvi9z3u3000r047dmbyz3gt4/0123456789abcdef01234567-thumb.webp")).toBe(true);
    expect(isValidMediaKey("r/../../etc/passwd")).toBe(false);
    expect(isValidMediaKey("r/abc/logo/x.png")).toBe(false);
    expect(isValidMediaKey("r/cmvi9z3tq000n047d0l1kwpfb/logo/0123456789abcdef01234567.svg")).toBe(false);
  });
});

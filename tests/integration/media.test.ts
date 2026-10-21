import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { FeatureNotInPlanError } from "@/server/plans/features";
import {
  MediaError,
  publicTableMedia,
  removeLogo,
  removeTableMedia,
  updateTableMediaAlt,
  uploadLogo,
  uploadTableMedia,
} from "@/server/media/service";
import { setMediaStorage, type MediaStorage } from "@/server/media/storage";
import { createRestaurant, resetDatabase } from "../support/factory";

/** In-Memory-Speicher, um zu prüfen, was geschrieben und gelöscht wird. */
const objects = new Map<string, Buffer>();
const memory: MediaStorage = {
  async put(key, body) {
    objects.set(key, body);
  },
  async get(key) {
    const body = objects.get(key);
    return body ? { body, contentType: "image/webp" } : null;
  },
  async delete(key) {
    objects.delete(key);
  },
};
setMediaStorage(memory);

const photo = (seed = 0) =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 100 + seed, g: 80, b: 60 } } }).jpeg().toBuffer();
const panorama = () => sharp({ create: { width: 4000, height: 2000, channels: 3, background: { r: 30, g: 60, b: 90 } } }).jpeg().toBuffer();

beforeEach(async () => {
  objects.clear();
  await resetDatabase();
});
afterAll(() => db.$disconnect());

async function setup(plan: "BASIC" | "PRO" = "PRO") {
  const a = await createRestaurant("medien-a");
  const b = await createRestaurant("medien-b");
  await db.restaurant.update({ where: { id: a.restaurant.id }, data: { planCode: plan } });
  const user = await db.user.create({ data: { email: "o@m.test", passwordHash: "x" } });
  return { a, b, ra: { id: a.restaurant.id, planCode: plan }, userId: user.id };
}

describe("Tischansicht", () => {
  it("speichert Foto + Vorschau unter dem Mandanten und ersetzt alte Dateien", async () => {
    const { a, ra, userId } = await setup();
    const table = a.tables[0];
    const first = await uploadTableMedia({ restaurant: ra, tableId: table.id, kind: "PHOTO", file: await photo(0), userId });
    expect(first.url).toMatch(new RegExp(`^/media/r/${ra.id}/tables/${table.id}/[a-f0-9]{24}\\.webp$`));
    expect(objects.size).toBe(2);

    await uploadTableMedia({ restaurant: ra, tableId: table.id, kind: "PANORAMA_360", file: await panorama(), userId, altDe: "Blick zum Fenster" });
    expect(objects.size).toBe(2); // alte Dateien gelöscht
    const media = await db.tableMedia.findUniqueOrThrow({ where: { tableId: table.id } });
    expect(media.kind).toBe("PANORAMA_360");
    expect(media.altDe).toBe("Blick zum Fenster");
    expect(media.altEn).toBe(`View from table ${table.name}`);

    await removeTableMedia(ra, table.id, userId);
    expect(objects.size).toBe(0);
    expect(await db.tableMedia.count()).toBe(0);
  });

  it("verweigert Uploads für Tische anderer Restaurants", async () => {
    const { b, ra, userId } = await setup();
    await expect(
      uploadTableMedia({ restaurant: ra, tableId: b.tables[0].id, kind: "PHOTO", file: await photo(), userId }),
    ).rejects.toBeInstanceOf(MediaError);
    expect(objects.size).toBe(0);
  });

  it("ist im Basic-Tarif gesperrt und wird dem Widget nicht ausgeliefert", async () => {
    const { a, ra, userId } = await setup("PRO");
    await uploadTableMedia({ restaurant: ra, tableId: a.tables[0].id, kind: "PHOTO", file: await photo(), userId });
    expect((await publicTableMedia(ra)).size).toBe(1);

    const basic = { ...ra, planCode: "BASIC" as const };
    expect((await publicTableMedia(basic)).size).toBe(0); // Daten bleiben, werden aber nicht ausgeliefert
    await expect(
      uploadTableMedia({ restaurant: basic, tableId: a.tables[0].id, kind: "PHOTO", file: await photo(1), userId }),
    ).rejects.toBeInstanceOf(FeatureNotInPlanError);
    // Entfernen bleibt nach Downgrade möglich (Datensparsamkeit)
    await removeTableMedia(basic, a.tables[0].id, userId);
    expect(objects.size).toBe(0);
  });
});

describe("Robustheit", () => {
  it("hinterlässt bei zwei gleichzeitigen Uploads keine verwaisten Dateien", async () => {
    const { a, ra, userId } = await setup();
    const tableId = a.tables[0].id;
    await Promise.all([
      uploadTableMedia({ restaurant: ra, tableId, kind: "PHOTO", file: await photo(1), userId }),
      uploadTableMedia({ restaurant: ra, tableId, kind: "PHOTO", file: await photo(2), userId }),
    ]);
    const row = await db.tableMedia.findUniqueOrThrow({ where: { tableId } });
    expect([...objects.keys()].sort()).toEqual([row.storageKey, row.thumbKey].sort());
  });

  it("räumt hochgeladene Dateien auf, wenn das Speichern in der Datenbank scheitert", async () => {
    const { a, ra, userId } = await setup();
    // Restaurant-Referenz mit nicht existierender ID → Fremdschlüssel schlägt beim Anlegen fehl
    const broken = { ...ra, id: "cmvi9z3th0006047dw8nichtda" };
    await db.table.update({ where: { id: a.tables[0].id }, data: { restaurantId: ra.id } });
    await expect(uploadLogo(broken, await sharp({ create: { width: 200, height: 80, channels: 3, background: "#fff" } }).png().toBuffer(), userId)).rejects.toThrow();
    expect(objects.size).toBe(0);
  });

  it("setzt beim Leeren der Beschreibung wieder einen sinnvollen Alt-Text", async () => {
    const { a, ra, userId } = await setup();
    const table = a.tables[0];
    await uploadTableMedia({ restaurant: ra, tableId: table.id, kind: "PHOTO", file: await photo(), userId, altDe: "Ecke am Fenster" });
    await updateTableMediaAlt(ra, table.id, "  ", null);
    const row = await db.tableMedia.findUniqueOrThrow({ where: { tableId: table.id } });
    expect(row.altDe).toBe(`Blick vom Tisch ${table.name}`);
    expect(row.altEn).toBe(`View from table ${table.name}`);
  });
});

describe("Logo", () => {
  it("ist in jedem Tarif erlaubt und ersetzt das vorherige", async () => {
    const { ra, userId } = await setup("BASIC");
    const logo = await sharp({ create: { width: 600, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const first = await uploadLogo(ra, logo, userId);
    expect(first.url).toMatch(/\/logo\/[a-f0-9]{24}\.png$/);
    const other = await sharp({ create: { width: 600, height: 200, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    await uploadLogo(ra, other, userId);
    expect(objects.size).toBe(1);
    const branding = await db.branding.findUniqueOrThrow({ where: { restaurantId: ra.id } });
    expect([branding.logoWidth, branding.logoHeight]).toEqual([600, 200]);
    await removeLogo(ra, userId);
    expect(objects.size).toBe(0);
  });
});

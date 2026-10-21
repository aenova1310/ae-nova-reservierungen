import "server-only";
import { db } from "../db";
import { hasFeature, requireFeature, type PlanCode } from "../plans/features";
import { MediaError, processLogo, processPanorama, processTablePhoto, type ProcessedImage } from "./process";
import { mediaStorage, mediaUrl } from "./storage";

export { MediaError } from "./process";

export type TableMediaKind = "PHOTO" | "PANORAMA_360";

interface RestaurantRef {
  id: string;
  planCode: PlanCode;
}

/** Darstellung eines Tisch-Mediums für Admin und Widget (eine Stelle für Schlüssel → URL). */
export interface TableMediaView {
  kind: TableMediaKind;
  url: string;
  thumbUrl: string | null;
  altDe: string;
  altEn: string;
  width: number | null;
  height: number | null;
}

type TableMediaRow = {
  kind: string;
  storageKey: string;
  thumbKey: string | null;
  altDe: string | null;
  altEn: string | null;
  width: number | null;
  height: number | null;
};

/** null für Medienarten ohne Renderer (Video/3D – vorbereitet). */
export function toMediaView(row: TableMediaRow): TableMediaView | null {
  if (row.kind !== "PHOTO" && row.kind !== "PANORAMA_360") return null;
  return {
    kind: row.kind,
    url: mediaUrl(row.storageKey),
    thumbUrl: row.thumbKey ? mediaUrl(row.thumbKey) : null,
    altDe: row.altDe ?? "",
    altEn: row.altEn ?? row.altDe ?? "",
    width: row.width,
    height: row.height,
  };
}

export function logoView(branding: { logoKey: string | null; logoWidth: number | null; logoHeight: number | null } | null) {
  return branding?.logoKey && branding.logoWidth && branding.logoHeight
    ? { url: mediaUrl(branding.logoKey), width: branding.logoWidth, height: branding.logoHeight }
    : null;
}

const keyFor = (restaurantId: string, scope: string, img: ProcessedImage, suffix = "") =>
  `r/${restaurantId}/${scope}/${img.hash}${suffix}.${img.ext}`;

/** Dateien löschen; Fehler nur protokollieren (Datensatz ist maßgeblich). */
async function removeQuietly(keys: (string | null | undefined)[]) {
  for (const key of keys) {
    if (!key) continue;
    try {
      await mediaStorage().delete(key);
    } catch (error) {
      console.warn(`[media] Löschen fehlgeschlagen: ${key}`, error);
    }
  }
}

/**
 * Neue Dateien speichern und den Datensatz in einer gesperrten Transaktion
 * umstellen. Ersetzte Dateien werden erst nach dem Commit gelöscht; schlägt
 * die Transaktion fehl, werden die gerade hochgeladenen Dateien entfernt.
 * Die Sperre (pro Datensatz) verhindert bei Doppelklicks verwaiste Dateien:
 * Der zweite Upload sieht den ersten als "vorher" und räumt ihn ab.
 */
async function replaceObjects(
  lockKey: string,
  uploads: { key: string; img: ProcessedImage }[],
  swap: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<(string | null | undefined)[]>,
) {
  for (const u of uploads) await mediaStorage().put(u.key, u.img.body, u.img.contentType);
  let replaced: (string | null | undefined)[];
  try {
    replaced = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return swap(tx);
    });
  } catch (error) {
    await removeQuietly(uploads.map((u) => u.key));
    throw error;
  }
  const keep = new Set(uploads.map((u) => u.key));
  await removeQuietly(replaced.filter((k) => k && !keep.has(k)));
}

// ─── Logo (alle Tarife) ─────────────────────────────────────────────────────

export async function uploadLogo(restaurant: RestaurantRef, file: Buffer, userId: string) {
  const img = await processLogo(file);
  const key = keyFor(restaurant.id, "logo", img);
  await replaceObjects(`logo:${restaurant.id}`, [{ key, img }], async (tx) => {
    const before = await tx.branding.findUnique({ where: { restaurantId: restaurant.id }, select: { logoKey: true } });
    const data = { logoKey: key, logoWidth: img.width, logoHeight: img.height };
    await tx.branding.upsert({ where: { restaurantId: restaurant.id }, update: data, create: { ...data, restaurantId: restaurant.id } });
    await tx.auditLog.create({ data: { restaurantId: restaurant.id, userId, action: "branding.logo_uploaded" } });
    return [before?.logoKey];
  });
  return { url: mediaUrl(key), width: img.width, height: img.height };
}

export async function removeLogo(restaurant: RestaurantRef, userId: string) {
  const before = await db.branding.findUnique({ where: { restaurantId: restaurant.id }, select: { logoKey: true } });
  if (!before?.logoKey) return;
  await db.branding.update({ where: { restaurantId: restaurant.id }, data: { logoKey: null, logoWidth: null, logoHeight: null } });
  await db.auditLog.create({ data: { restaurantId: restaurant.id, userId, action: "branding.logo_removed" } });
  await removeQuietly([before.logoKey]);
}

// ─── Tischansicht (Pro) ─────────────────────────────────────────────────────

/** Tisch muss zum Restaurant gehören – sonst "nicht gefunden" (kein Hinweis auf fremde Daten). */
async function ownTable(restaurantId: string, tableId: string) {
  const table = await db.table.findFirst({ where: { id: tableId, restaurantId }, select: { id: true, name: true } });
  if (!table) throw new MediaError("Tisch nicht gefunden.");
  return table;
}

/** Leere Beschreibung → sinnvoller Standard (nie ein leeres alt-Attribut für Gäste). */
const altDeFor = (v: string | null | undefined, tableName: string) => v?.trim().slice(0, 200) || `Blick vom Tisch ${tableName}`;
const altEnFor = (v: string | null | undefined, tableName: string) => v?.trim().slice(0, 200) || `View from table ${tableName}`;

export async function uploadTableMedia(params: {
  restaurant: RestaurantRef;
  tableId: string;
  kind: TableMediaKind;
  file: Buffer;
  altDe?: string | null;
  altEn?: string | null;
  userId: string;
}) {
  requireFeature(params.restaurant, "tableView");
  const table = await ownTable(params.restaurant.id, params.tableId);
  const processed = params.kind === "PANORAMA_360" ? await processPanorama(params.file) : await processTablePhoto(params.file);

  const scope = `tables/${table.id}`;
  const mainKey = keyFor(params.restaurant.id, scope, processed.main);
  const thumbKey = keyFor(params.restaurant.id, scope, processed.thumb, "-thumb");
  const data = {
    kind: params.kind,
    storageKey: mainKey,
    thumbKey,
    mimeType: processed.main.contentType,
    width: processed.main.width,
    height: processed.main.height,
    bytes: processed.main.body.length,
    altDe: altDeFor(params.altDe, table.name),
    altEn: altEnFor(params.altEn, table.name),
  };

  await replaceObjects(
    `table-media:${table.id}`,
    [
      { key: mainKey, img: processed.main },
      { key: thumbKey, img: processed.thumb },
    ],
    async (tx) => {
      const before = await tx.tableMedia.findUnique({ where: { tableId: table.id } });
      await tx.tableMedia.upsert({
        where: { tableId: table.id },
        update: data,
        create: { ...data, tableId: table.id, restaurantId: params.restaurant.id },
      });
      await tx.auditLog.create({
        data: { restaurantId: params.restaurant.id, userId: params.userId, action: "table.media_uploaded", entityId: table.id, meta: { kind: params.kind } },
      });
      return [before?.storageKey, before?.thumbKey];
    },
  );
  return { url: mediaUrl(mainKey), thumbUrl: mediaUrl(thumbKey), width: data.width, height: data.height };
}

export async function updateTableMediaAlt(restaurant: RestaurantRef, tableId: string, altDe: string | null, altEn: string | null) {
  requireFeature(restaurant, "tableView");
  const table = await ownTable(restaurant.id, tableId);
  await db.tableMedia.updateMany({
    where: { tableId, restaurantId: restaurant.id },
    data: { altDe: altDeFor(altDe, table.name), altEn: altEnFor(altEn, table.name) },
  });
}

/** Entfernen ist auch nach einem Downgrade möglich (Datensparsamkeit). */
export async function removeTableMedia(restaurant: RestaurantRef, tableId: string, userId: string) {
  await ownTable(restaurant.id, tableId);
  const before = await db.tableMedia.findUnique({ where: { tableId } });
  if (!before || before.restaurantId !== restaurant.id) return;
  await db.tableMedia.delete({ where: { tableId } });
  await db.auditLog.create({ data: { restaurantId: restaurant.id, userId, action: "table.media_removed", entityId: tableId } });
  await removeQuietly([before.storageKey, before.thumbKey]);
}

/** Medien für das Widget – nur wenn der Tarif die Tischansicht enthält. */
export async function publicTableMedia(restaurant: RestaurantRef): Promise<Map<string, TableMediaView>> {
  if (!hasFeature(restaurant.planCode, "tableView")) return new Map();
  const rows = await db.tableMedia.findMany({ where: { restaurantId: restaurant.id } });
  return new Map(rows.flatMap((m) => {
    const view = toMediaView(m);
    return view ? [[m.tableId, view] as const] : [];
  }));
}

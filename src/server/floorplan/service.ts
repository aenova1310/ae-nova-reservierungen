import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { msg } from "@/i18n/admin";
import { sanitizeArea, sanitizeTable, type PlanArea, type PlanTable } from "@/lib/floorplan";
import { db, type Tx } from "../db";
import { UserFacingError } from "../http/admin-action";
import { requireFeature, type PlanCode } from "../plans/features";

/**
 * Raumplan: Laden und Speichern von Bereichs- und Tischgeometrie (Pro).
 *
 * Gespeichert wird immer der vollständige Plan in einer Transaktion. Die
 * "Version" ist ein Hash über alle angezeigten Werte – hat jemand anderes
 * zwischenzeitlich Tische oder Bereiche geändert (auch auf der Seite
 * „Tische & Bereiche“), wird das Speichern abgelehnt statt still zu überschreiben.
 */
export class FloorplanError extends UserFacingError {}

interface RestaurantRef {
  id: string;
  planCode: PlanCode;
}

export interface Floorplan {
  areas: PlanArea[];
  tables: PlanTable[];
  version: string;
}

/** Neue Bereiche aus dem Editor tragen eine temporäre ID mit diesem Präfix. */
export const NEW_AREA_PREFIX = "new:";

const AREA_SELECT = { id: true, name: true, planX: true, planY: true, planWidth: true, planHeight: true, planColor: true } as const;
const TABLE_SELECT = {
  id: true,
  name: true,
  areaId: true,
  posX: true,
  posY: true,
  width: true,
  height: true,
  rotation: true,
  shape: true,
  minCapacity: true,
  maxCapacity: true,
  active: true,
} as const;

async function readPlan(client: Tx | typeof db, restaurantId: string): Promise<Floorplan> {
  const [areaRows, tableRows] = await Promise.all([
    client.area.findMany({ where: { restaurantId }, select: AREA_SELECT, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    client.table.findMany({ where: { restaurantId }, select: TABLE_SELECT, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const areas: PlanArea[] = areaRows.map((a) => ({
    id: a.id,
    name: a.name,
    x: a.planX,
    y: a.planY,
    width: a.planWidth,
    height: a.planHeight,
    color: a.planColor,
  }));
  const tables: PlanTable[] = tableRows.map((t) => ({
    id: t.id,
    name: t.name,
    areaId: t.areaId,
    x: t.posX,
    y: t.posY,
    width: t.width,
    height: t.height,
    rotation: t.rotation,
    shape: t.shape,
    minCapacity: t.minCapacity,
    maxCapacity: t.maxCapacity,
    active: t.active,
  }));
  return { areas, tables, version: versionOf(areas, tables) };
}

function versionOf(areas: PlanArea[], tables: PlanTable[]): string {
  const canonical = JSON.stringify([
    [...areas].sort((a, b) => a.id.localeCompare(b.id)),
    [...tables].sort((a, b) => a.id.localeCompare(b.id)),
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** Lesen ist in jedem Tarif erlaubt (z. B. für eine spätere Anzeige im Tagesplan). */
export function loadFloorplan(restaurantId: string): Promise<Floorplan> {
  return readPlan(db, restaurantId);
}

const coord = z.number().finite();
const savePayload = z.object({
  baseVersion: z.string().min(1).max(64),
  areas: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().trim().min(1, msg("fp.v.areaNameMissing")).max(60),
        x: coord,
        y: coord,
        width: coord,
        height: coord,
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullable(),
      }),
    )
    .min(1, msg("fp.v.minOneArea"))
    .max(50),
  tables: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        areaId: z.string().min(1).max(64),
        x: coord,
        y: coord,
        width: coord,
        height: coord,
        rotation: coord,
        shape: z.enum(["RECT", "SQUARE", "ROUND"]),
      }),
    )
    .max(500),
});
export type FloorplanPayload = z.input<typeof savePayload>;

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));

/**
 * Speichert den Plan. Prüft serverseitig Tarif, Zugehörigkeit aller IDs zum
 * Restaurant, Grenzen der Geometrie und eindeutige Bereichsnamen.
 */
export async function saveFloorplan(restaurant: RestaurantRef, input: unknown, userId: string): Promise<Floorplan> {
  requireFeature(restaurant, "floorplanEditor");
  const payload = savePayload.parse(input);

  const names = payload.areas.map((a) => a.name.toLocaleLowerCase("de"));
  const duplicate = payload.areas.find((_, i) => names.indexOf(names[i]) !== i);
  if (duplicate) throw new FloorplanError("fp.err.duplicateArea", { name: duplicate.name });

  return db.$transaction(async (tx) => {
    // Gleichzeitiges Speichern desselben Plans serialisieren
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`floorplan:${restaurant.id}`}))`;
    const current = await readPlan(tx, restaurant.id);
    if (current.version !== payload.baseVersion) {
      throw new FloorplanError("fp.err.changed");
    }

    // Vollständigkeit: genau die vorhandenen Tische und Bereiche, nichts Fremdes
    const existingAreaIds = payload.areas.filter((a) => !a.id.startsWith(NEW_AREA_PREFIX)).map((a) => a.id);
    if (!sameSet(existingAreaIds, current.areas.map((a) => a.id))) throw new FloorplanError("fp.err.areaMismatch");
    if (!sameSet(payload.tables.map((t) => t.id), current.tables.map((t) => t.id))) throw new FloorplanError("fp.err.tableMismatch");

    // Umbenennungen zweistufig: erst Platzhalternamen, sonst scheitern Tausch oder
    // Kette ("A→B, B→C") am eindeutigen Namen je Restaurant
    const renamed = payload.areas.filter((a) => !a.id.startsWith(NEW_AREA_PREFIX) && current.areas.find((c) => c.id === a.id)?.name !== a.name);
    for (const a of renamed) {
      await tx.area.update({ where: { id: a.id, restaurantId: restaurant.id }, data: { name: `__umbenennen__${a.id}` } });
    }

    // Neue Bereiche anlegen, temporäre IDs auf echte abbilden
    const idMap = new Map(existingAreaIds.map((id) => [id, id]));
    let sortOrder = current.areas.length;
    for (const a of payload.areas) {
      const geo = sanitizeArea(a);
      const data = { name: a.name, planX: geo.x, planY: geo.y, planWidth: geo.width, planHeight: geo.height, planColor: a.color };
      if (a.id.startsWith(NEW_AREA_PREFIX)) {
        const created = await tx.area.create({ data: { ...data, restaurantId: restaurant.id, sortOrder: sortOrder++ }, select: { id: true } });
        idMap.set(a.id, created.id);
      } else {
        await tx.area.update({ where: { id: a.id, restaurantId: restaurant.id }, data });
      }
    }

    for (const t of payload.tables) {
      const areaId = idMap.get(t.areaId);
      if (!areaId) throw new FloorplanError("fp.err.unknownArea");
      const geo = sanitizeTable(t);
      await tx.table.update({
        where: { id: t.id, restaurantId: restaurant.id },
        data: { areaId, posX: geo.x, posY: geo.y, width: geo.width, height: geo.height, rotation: geo.rotation, shape: geo.shape },
      });
    }

    const moved = payload.tables.filter((t) => current.tables.find((c) => c.id === t.id)?.areaId !== idMap.get(t.areaId)).length;
    await tx.auditLog.create({
      data: {
        restaurantId: restaurant.id,
        userId,
        action: "floorplan.saved",
        meta: { areas: payload.areas.length, newAreas: payload.areas.length - existingAreaIds.length, tablesMovedArea: moved },
      },
    });
    return readPlan(tx, restaurant.id);
  });
}

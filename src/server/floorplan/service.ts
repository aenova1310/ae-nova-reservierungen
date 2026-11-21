import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { msg } from "@/i18n/admin";
import { sanitizeArea, sanitizeTable, type PlanArea, type PlanTable } from "@/lib/floorplan";
import { db, type Tx } from "../db";
import { mediaStorage } from "../media/storage";
import { UserFacingError } from "../http/admin-action";
import { requireFeature, type PlanCode } from "../plans/features";
import { lockRestaurant } from "../reservations/create";

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
  onlineBookable: true,
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
    onlineBookable: t.onlineBookable,
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
        name: z.string().trim().min(1, msg("fp.v.tableNameMissing")).max(30),
        minCapacity: z.number().int().min(1, msg("common.v.min", { min: 1 })).max(50, msg("common.v.max", { max: 50 })),
        maxCapacity: z.number().int().min(1, msg("common.v.min", { min: 1 })).max(50, msg("common.v.max", { max: 50 })),
        onlineBookable: z.boolean(),
      }),
    )
    .max(500),
});

/** Neue Tische tragen bis zum Speichern eine temporäre ID mit diesem Präfix. */
export const NEW_TABLE_PREFIX = "newt:";

const ACTIVE_RESERVATION = ["PENDING_PAYMENT", "REQUESTED", "CONFIRMED", "ARRIVED", "NO_SHOW"] as const;
export type FloorplanPayload = z.input<typeof savePayload>;

/**
 * Speichert den Plan. Prüft serverseitig Tarif, Zugehörigkeit aller IDs zum
 * Restaurant, Grenzen der Geometrie und eindeutige Namen.
 *
 * Der Editor zeigt nur aktive Tische. Fehlt ein aktiver Tisch im Plan, wurde er
 * gelöscht: ohne Buchungshistorie endgültig (samt Kombinationen und Foto),
 * mit Historie deaktiviert. Tische mit kommenden Reservierungen lassen sich
 * nicht löschen – die müssen erst umgesetzt werden. Leere Bereiche ebenso.
 */
export async function saveFloorplan(restaurant: RestaurantRef, input: unknown, userId: string): Promise<Floorplan> {
  requireFeature(restaurant, "floorplanEditor");
  const payload = savePayload.parse(input);

  const names = payload.areas.map((a) => a.name.toLocaleLowerCase("de"));
  const duplicate = payload.areas.find((_, i) => names.indexOf(names[i]) !== i);
  if (duplicate) throw new FloorplanError("fp.err.duplicateArea", { name: duplicate.name });
  const tableNames = payload.tables.map((t) => t.name.toLocaleLowerCase("de"));
  const duplicateTable = payload.tables.find((_, i) => tableNames.indexOf(tableNames[i]) !== i);
  if (duplicateTable) throw new FloorplanError("fp.err.duplicateTable", { name: duplicateTable.name });
  const badCapacity = payload.tables.find((t) => t.maxCapacity < t.minCapacity);
  if (badCapacity) throw new FloorplanError("fp.err.capacityOrder", { name: badCapacity.name });

  return db.$transaction(async (tx) => {
    // Gleichzeitiges Speichern desselben Plans serialisieren
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`floorplan:${restaurant.id}`}))`;
    // Dieselbe Sperre wie Buchen und Umsetzen: kein Umsetzen auf einen Tisch, der gerade gelöscht wird
    await lockRestaurant(tx, restaurant.id);
    const current = await readPlan(tx, restaurant.id);
    if (current.version !== payload.baseVersion) {
      throw new FloorplanError("fp.err.changed");
    }

    // Nur eigene Tische und Bereiche; was fehlt, wurde im Editor gelöscht
    const existingAreaIds = payload.areas.filter((a) => !a.id.startsWith(NEW_AREA_PREFIX)).map((a) => a.id);
    const currentAreaIds = current.areas.map((a) => a.id);
    if (new Set(existingAreaIds).size !== existingAreaIds.length || !existingAreaIds.every((id) => currentAreaIds.includes(id))) {
      throw new FloorplanError("fp.err.areaMismatch");
    }
    const activeIds = current.tables.filter((t) => t.active).map((t) => t.id);
    const existingTableIds = payload.tables.filter((t) => !t.id.startsWith(NEW_TABLE_PREFIX)).map((t) => t.id);
    if (new Set(existingTableIds).size !== existingTableIds.length || !existingTableIds.every((id) => activeIds.includes(id))) {
      throw new FloorplanError("fp.err.tableMismatch");
    }
    // Namen deaktivierter Tische sind weiter belegt (eindeutig je Restaurant)
    const inactiveName = payload.tables.find((t) =>
      current.tables.some((c) => !c.active && c.name.toLocaleLowerCase("de") === t.name.toLocaleLowerCase("de")),
    );
    if (inactiveName) throw new FloorplanError("fp.err.nameOfInactive", { name: inactiveName.name });

    // Gelöschte Tische: kommende Reservierungen verhindern das Löschen
    const deletedIds = activeIds.filter((id) => !existingTableIds.includes(id));
    const busy = deletedIds.length
      ? await tx.reservationTable.findFirst({
          where: { tableId: { in: deletedIds }, active: true, blockedUntil: { gt: new Date() }, reservation: { status: { in: [...ACTIVE_RESERVATION] } } },
          select: { tableId: true },
        })
      : null;
    if (busy) throw new FloorplanError("fp.err.tableHasReservations", { name: current.tables.find((t) => t.id === busy.tableId)?.name ?? "" });

    // Umbenennungen zweistufig: erst Platzhalternamen, sonst scheitern Tausch oder
    // Kette ("A→B, B→C") am eindeutigen Namen je Restaurant
    const renamed = payload.areas.filter((a) => !a.id.startsWith(NEW_AREA_PREFIX) && current.areas.find((c) => c.id === a.id)?.name !== a.name);
    for (const a of renamed) {
      await tx.area.update({ where: { id: a.id, restaurantId: restaurant.id }, data: { name: `__umbenennen__${a.id}` } });
    }

    // Entfernte Bereiche vorab umbenennen: ihr Name darf in derselben Speicherung neu vergeben werden
    const removedAreas = currentAreaIds.filter((id) => !existingAreaIds.includes(id));
    for (const id of removedAreas) {
      await tx.area.update({ where: { id, restaurantId: restaurant.id }, data: { name: `__entfernt__${id}` } });
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

    // Gelöschte Tische: mit Historie deaktivieren, sonst entfernen (Kombinationen mit ihnen fallen weg)
    const mediaKeys: string[] = [];
    let deactivated = 0;
    for (const id of deletedIds) {
      const history = await tx.reservationTable.count({ where: { tableId: id } });
      if (history > 0) {
        // Namen freigeben (eindeutig je Restaurant) – der Tisch bleibt nur für die Historie
        const old = current.tables.find((x) => x.id === id)!;
        await tx.table.update({
          where: { id, restaurantId: restaurant.id },
          data: { active: false, onlineBookable: false, name: `${old.name.slice(0, 30)} (alt ${id.slice(-4)})` },
        });
        deactivated++;
      } else {
        const media = await tx.tableMedia.findUnique({ where: { tableId: id }, select: { storageKey: true, thumbKey: true } });
        if (media) mediaKeys.push(media.storageKey, ...(media.thumbKey ? [media.thumbKey] : []));
        await tx.tableCombination.deleteMany({ where: { restaurantId: restaurant.id, tables: { some: { tableId: id } } } });
        await tx.table.delete({ where: { id, restaurantId: restaurant.id } });
      }
    }

    // Tischnamen ebenfalls zweistufig ändern (Tausch "1" ↔ "2")
    const renamedTables = payload.tables.filter((t) => !t.id.startsWith(NEW_TABLE_PREFIX) && current.tables.find((c) => c.id === t.id)?.name !== t.name);
    for (const t of renamedTables) {
      await tx.table.update({ where: { id: t.id, restaurantId: restaurant.id }, data: { name: `__umbenennen__${t.id}` } });
    }

    let tableOrder = current.tables.length;
    for (const t of payload.tables) {
      const areaId = idMap.get(t.areaId);
      if (!areaId) throw new FloorplanError("fp.err.unknownArea");
      const geo = sanitizeTable(t);
      const data = {
        areaId,
        posX: geo.x,
        posY: geo.y,
        width: geo.width,
        height: geo.height,
        rotation: geo.rotation,
        shape: geo.shape,
        name: t.name,
        minCapacity: t.minCapacity,
        maxCapacity: t.maxCapacity,
        onlineBookable: t.onlineBookable,
      };
      if (t.id.startsWith(NEW_TABLE_PREFIX)) {
        await tx.table.create({ data: { ...data, restaurantId: restaurant.id, sortOrder: tableOrder++, active: true } });
      } else {
        await tx.table.update({ where: { id: t.id, restaurantId: restaurant.id }, data });
      }
    }

    // Bereiche, die im Editor entfernt wurden – nur wenn keine Tische mehr darin stehen (auch deaktivierte)
    for (const id of removedAreas) {
      const remaining = await tx.table.count({ where: { areaId: id, restaurantId: restaurant.id } });
      if (remaining > 0) throw new FloorplanError("fp.err.areaNotEmpty", { name: current.areas.find((a) => a.id === id)?.name ?? "" });
      await tx.area.delete({ where: { id, restaurantId: restaurant.id } });
    }

    const moved = payload.tables.filter((t) => !t.id.startsWith(NEW_TABLE_PREFIX) && current.tables.find((c) => c.id === t.id)?.areaId !== idMap.get(t.areaId)).length;
    await tx.auditLog.create({
      data: {
        restaurantId: restaurant.id,
        userId,
        action: "floorplan.saved",
        meta: {
          areas: payload.areas.length,
          newAreas: payload.areas.length - existingAreaIds.length,
          removedAreas: removedAreas.length,
          newTables: payload.tables.length - existingTableIds.length,
          deletedTables: deletedIds.length - deactivated,
          deactivatedTables: deactivated,
          tablesMovedArea: moved,
        },
      },
    });
    return { plan: await readPlan(tx, restaurant.id), mediaKeys };
  }).then(async ({ plan, mediaKeys }) => {
    // Fotos gelöschter Tische erst nach dem Commit entfernen (Fehler nur protokollieren)
    for (const key of mediaKeys) await mediaStorage().delete(key).catch((e) => console.warn(`[media] Löschen fehlgeschlagen: ${key}`, e));
    return plan;
  });
}

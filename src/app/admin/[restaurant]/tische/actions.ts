"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { msg } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { formObject, runAction, UserFacingError } from "@/server/http/admin-action";
import { requireRestaurantAccess } from "@/server/tenancy/access";

const refresh = (slug: string) => revalidatePath(`/admin/${slug}`, "layout");
const bool = z.literal("on").optional().transform((v) => v === "on");

const areaSchema = z.object({
  name: z.string().min(1, msg("common.v.nameMissing")).max(60),
  nameEn: z.string().max(60).optional(),
  onlineBookable: bool,
});

export async function saveAreaAction(slug: string, areaId: string | null, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug);
    const data = areaSchema.parse(formObject(formData));
    if (areaId) {
      await tdb.area.update({ where: { id: areaId }, data: { ...data, nameEn: data.nameEn ?? null } });
    } else {
      const count = await tdb.area.count();
      await tdb.area.create({ data: { ...data, restaurantId: restaurant.id, sortOrder: count } });
    }
    refresh(slug);
    return areaId ? t("tables.msg.areaSaved") : t("tables.msg.areaCreated");
  });
}

export async function deleteAreaAction(slug: string, areaId: string) {
  return runAction(async (t) => {
    const { tdb } = await requireRestaurantAccess(slug);
    const tables = await tdb.table.count({ where: { areaId } });
    if (tables > 0) throw new UserFacingError("tables.err.areaNotEmpty");
    await tdb.area.delete({ where: { id: areaId } });
    refresh(slug);
    return t("tables.msg.areaDeleted");
  });
}

const tableSchema = z
  .object({
    name: z.string().min(1, msg("common.v.nameMissing")).max(30),
    areaId: z.string().min(1),
    minCapacity: z.coerce.number().int().min(1, msg("common.v.min", { min: 1 })).max(50),
    maxCapacity: z.coerce.number().int().min(1).max(50),
    onlineBookable: bool,
    active: bool,
  })
  .refine((d) => d.maxCapacity >= d.minCapacity, { message: msg("tables.v.maxGteMin"), path: ["maxCapacity"] });

export async function saveTableAction(slug: string, tableId: string | null, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug);
    const raw = formObject(formData);
    const data = tableSchema.parse({ ...raw, active: tableId ? raw.active : "on" });
    // Bereich muss zum eigenen Restaurant gehören
    if (!(await tdb.area.findUnique({ where: { id: data.areaId } }))) throw new UserFacingError("tables.err.areaNotFound");
    const duplicate = await tdb.table.findFirst({ where: { name: data.name, NOT: tableId ? { id: tableId } : undefined } });
    if (duplicate) throw new UserFacingError("tables.err.duplicate", { name: data.name });
    if (tableId) {
      await tdb.table.update({ where: { id: tableId }, data });
    } else {
      const count = await tdb.table.count();
      await tdb.table.create({ data: { ...data, restaurantId: restaurant.id, sortOrder: count } });
    }
    refresh(slug);
    return t(tableId ? "tables.msg.tableSaved" : "tables.msg.tableCreated", { name: data.name });
  });
}

export async function deleteTableAction(slug: string, tableId: string) {
  return runAction(async (t) => {
    const { tdb } = await requireRestaurantAccess(slug);
    const used = await tdb.reservationTable.count({ where: { tableId } });
    if (used > 0) {
      // Historie erhalten: deaktivieren statt löschen
      await tdb.table.update({ where: { id: tableId }, data: { active: false, onlineBookable: false } });
      refresh(slug);
      return t("tables.msg.tableDeactivated");
    }
    await tdb.table.delete({ where: { id: tableId } });
    refresh(slug);
    return t("tables.msg.tableDeleted");
  });
}

const comboSchema = z
  .object({
    tableIds: z.array(z.string()).min(2, msg("tables.v.minTwoTables")),
    minCapacity: z.coerce.number().int().min(1).max(200),
    maxCapacity: z.coerce.number().int().min(1).max(200),
  })
  .refine((d) => d.maxCapacity >= d.minCapacity, { message: msg("tables.v.maxGteMin"), path: ["maxCapacity"] });

export async function createCombinationAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug);
    const raw = formObject(formData);
    const data = comboSchema.parse({ ...raw, tableIds: formData.getAll("tableIds").map(String) });
    const tables = await tdb.table.findMany({ where: { id: { in: data.tableIds } }, orderBy: { sortOrder: "asc" } });
    if (tables.length !== data.tableIds.length) throw new UserFacingError("tables.err.unknownTable");
    await tdb.tableCombination.create({
      data: {
        restaurantId: restaurant.id,
        name: tables.map((x) => x.name).join(" + "),
        minCapacity: data.minCapacity,
        maxCapacity: data.maxCapacity,
        tables: { create: tables.map((x) => ({ tableId: x.id })) },
      },
    });
    refresh(slug);
    return t("tables.msg.comboCreated");
  });
}

export async function toggleCombinationAction(slug: string, id: string, field: "active" | "onlineBookable") {
  return runAction(async () => {
    const { tdb } = await requireRestaurantAccess(slug);
    const combo = await tdb.tableCombination.findUnique({ where: { id } });
    if (!combo) throw new UserFacingError("tables.err.comboNotFound");
    await tdb.tableCombination.update({ where: { id }, data: { [field]: !combo[field] } });
    refresh(slug);
  });
}

export async function deleteCombinationAction(slug: string, id: string) {
  return runAction(async (t) => {
    const { tdb } = await requireRestaurantAccess(slug);
    await tdb.tableCombination.delete({ where: { id } });
    refresh(slug);
    return t("tables.msg.comboDeleted");
  });
}

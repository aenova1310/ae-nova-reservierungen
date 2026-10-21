"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { msg } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { isLocalDate, isLocalTime } from "@/server/availability/time";
import { formObject, runAction, UserFacingError } from "@/server/http/admin-action";
import { requireRestaurantAccess } from "@/server/tenancy/access";

const refresh = (slug: string) => revalidatePath(`/admin/${slug}`, "layout");
const time = z.string().refine(isLocalTime, msg("hours.v.time"));

const shiftSchema = z.object({
  name: z.string().min(1, msg("common.v.nameMissing")).max(40),
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: time,
  endTime: time,
  lastSeatingTime: time.optional(),
  slotIntervalMinutes: z.coerce.number().int().min(5).max(120).optional(),
});

export async function saveShiftAction(slug: string, shiftId: string | null, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug);
    const d = shiftSchema.parse(formObject(formData));
    const data = { ...d, lastSeatingTime: d.lastSeatingTime ?? null, slotIntervalMinutes: d.slotIntervalMinutes ?? null };
    if (shiftId) await tdb.shift.update({ where: { id: shiftId }, data });
    else await tdb.shift.create({ data: { ...data, restaurantId: restaurant.id } });
    refresh(slug);
    return shiftId ? t("hours.msg.shiftSaved") : t("hours.msg.shiftCreated");
  });
}

export async function deleteShiftAction(slug: string, shiftId: string) {
  return runAction(async (t) => {
    const { tdb } = await requireRestaurantAccess(slug);
    await tdb.shift.delete({ where: { id: shiftId } });
    refresh(slug);
    return t("hours.msg.shiftDeleted");
  });
}

/** Alle Schichten eines Wochentags auf andere Wochentage kopieren. */
export async function copyWeekdayAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug);
    const from = z.coerce.number().int().min(1).max(7).parse(formData.get("from"));
    const targets = formData.getAll("to").map(Number).filter((n) => n >= 1 && n <= 7 && n !== from);
    if (!targets.length) throw new UserFacingError("hours.err.noTargets");
    const source = await tdb.shift.findMany({ where: { weekday: from } });
    await tdb.shift.deleteMany({ where: { weekday: { in: targets } } });
    await tdb.shift.createMany({
      data: targets.flatMap((weekday) =>
        source.map((s) => ({
          restaurantId: restaurant.id,
          weekday,
          name: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          lastSeatingTime: s.lastSeatingTime,
          slotIntervalMinutes: s.slotIntervalMinutes,
        })),
      ),
    });
    refresh(slug);
    return t("hours.msg.copied");
  });
}

const exceptionSchema = z
  .object({
    date: z.string().refine(isLocalDate, msg("hours.v.date")),
    type: z.enum(["CLOSED", "SPECIAL_HOURS"]),
    reason: z.string().max(80).optional(),
    startTime: time.optional(),
    endTime: time.optional(),
    lastSeatingTime: time.optional(),
  })
  .refine((d) => d.type === "CLOSED" || (d.startTime && d.endTime), { message: msg("hours.v.startEnd"), path: ["startTime"] });

export async function saveExceptionAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug);
    const d = exceptionSchema.parse(formObject(formData));
    await tdb.dateException.create({
      data: {
        restaurantId: restaurant.id,
        date: new Date(`${d.date}T00:00:00Z`),
        type: d.type,
        reason: d.reason ?? null,
        startTime: d.type === "SPECIAL_HOURS" ? d.startTime! : null,
        endTime: d.type === "SPECIAL_HOURS" ? d.endTime! : null,
        lastSeatingTime: d.type === "SPECIAL_HOURS" ? (d.lastSeatingTime ?? null) : null,
      },
    });
    refresh(slug);
    return d.type === "CLOSED" ? t("hours.msg.closedAdded") : t("hours.msg.specialAdded");
  });
}

export async function deleteExceptionAction(slug: string, id: string) {
  return runAction(async (t) => {
    const { tdb } = await requireRestaurantAccess(slug);
    await tdb.dateException.delete({ where: { id } });
    refresh(slug);
    return t("hours.msg.exceptionDeleted");
  });
}

const durationSchema = z.object({
  rules: z
    .array(
      z.object({
        minPartySize: z.coerce.number().int().min(1).max(200),
        maxPartySize: z.coerce.number().int().min(1).max(200),
        durationMinutes: z.coerce.number().int().min(15).max(600),
      }),
    )
    .max(10),
  defaultDurationMinutes: z.coerce.number().int().min(15).max(600),
});

/** Verweildauer-Regeln komplett ersetzen (überschneidungsfrei). */
export async function saveDurationRulesAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { tdb, restaurant } = await requireRestaurantAccess(slug);
    const mins = formData.getAll("min");
    const maxs = formData.getAll("max");
    const durations = formData.getAll("duration");
    const rules = mins
      .map((m, i) => ({ minPartySize: m, maxPartySize: maxs[i], durationMinutes: durations[i] }))
      .filter((r) => String(r.minPartySize).trim() && String(r.maxPartySize).trim() && String(r.durationMinutes).trim());
    const data = durationSchema.parse({ rules, defaultDurationMinutes: formData.get("defaultDurationMinutes") });
    const sorted = [...data.rules].sort((a, b) => a.minPartySize - b.minPartySize);
    for (const [i, r] of sorted.entries()) {
      if (r.maxPartySize < r.minPartySize) throw new UserFacingError("hours.err.rangeOrder");
      if (i > 0 && r.minPartySize <= sorted[i - 1].maxPartySize) throw new UserFacingError("hours.err.overlap");
    }
    await tdb.durationRule.deleteMany({});
    if (sorted.length) await tdb.durationRule.createMany({ data: sorted.map((r) => ({ ...r, restaurantId: restaurant.id })) });
    await tdb.restaurantSettings.update({ where: { restaurantId: restaurant.id }, data: { defaultDurationMinutes: data.defaultDurationMinutes } });
    refresh(slug);
    return t("hours.msg.durationSaved");
  });
}

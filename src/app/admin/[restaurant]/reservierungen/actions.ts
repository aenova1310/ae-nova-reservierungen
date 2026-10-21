"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { msg } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { isLocalDate, isLocalTime } from "@/server/availability/time";
import { dispatchEmails } from "@/server/email/outbox";
import { formObject, runAction } from "@/server/http/admin-action";
import { createReservation } from "@/server/reservations/create";
import { cancelReservation, modifyReservation } from "@/server/reservations/manage";
import { changeReservationStatus, releaseTablesNow, type ReservationStatus } from "@/server/reservations/status";
import { requireRestaurantAccess } from "@/server/tenancy/access";

const refresh = (slug: string) => revalidatePath(`/admin/${slug}`, "layout");

const manualSchema = z.object({
  date: z.string().refine(isLocalDate, msg("res.v.date")),
  time: z.string().refine(isLocalTime, msg("res.v.time")),
  partySize: z.coerce.number().int().min(1, msg("common.v.min", { min: 1 })).max(200),
  seat: z.string().optional(),
  source: z.enum(["PHONE", "WALK_IN", "ADMIN"]),
  name: z.string().min(1, msg("res.v.name")).max(120),
  phone: z.string().max(40).optional(),
  email: z.string().email(msg("res.v.email")).optional(),
  notes: z.string().max(1000).optional(),
  internalNotes: z.string().max(1000).optional(),
  durationMinutes: z.coerce.number().int().min(15).max(600).optional(),
  notifyGuest: z.literal("on").optional(),
});

/** Telefonische Reservierung oder Walk-in erfassen. */
export async function createManualReservationAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { restaurant, user } = await requireRestaurantAccess(slug);
    const data = manualSchema.parse(formObject(formData));
    const [kind, id] = data.seat?.split(":") ?? [];
    const created = await createReservation({
      restaurantId: restaurant.id,
      date: data.date,
      time: data.time,
      partySize: data.partySize,
      channel: "STAFF",
      source: data.source,
      choice: kind === "table" || kind === "combination" ? { kind, id } : null,
      guest: { name: data.name, phone: data.phone, email: data.email, notes: data.notes },
      internalNotes: data.internalNotes,
      createdById: user.id,
      durationOverrideMinutes: data.durationMinutes ?? null,
      notifyGuest: data.notifyGuest === "on",
    });
    after(() => dispatchEmails(created.emailIds));
    refresh(slug);
    return t("res.created", { code: created.code, tables: created.tableNames.join(" + ") });
  });
}

export async function changeStatusAction(slug: string, reservationId: string, to: ReservationStatus) {
  return runAction(async (t) => {
    const { restaurant, user } = await requireRestaurantAccess(slug);
    const { emailIds } = await changeReservationStatus({ restaurantId: restaurant.id, reservationId, to, userId: user.id });
    after(() => dispatchEmails(emailIds));
    refresh(slug);
    return t("res.statusChanged");
  });
}

const cancelSchema = z.object({ reason: z.string().max(500).optional(), notifyGuest: z.literal("on").optional() });

export async function cancelByRestaurantAction(slug: string, reservationId: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { restaurant, user } = await requireRestaurantAccess(slug);
    const data = cancelSchema.parse(formObject(formData));
    const { emailIds } = await cancelReservation({
      reservationId,
      restaurantId: restaurant.id,
      by: "RESTAURANT",
      reason: data.reason,
      userId: user.id,
      notifyGuest: data.notifyGuest === "on",
    });
    after(() => dispatchEmails(emailIds));
    refresh(slug);
    return t("res.cancelled");
  });
}

const modifySchema = z.object({
  date: z.string().refine(isLocalDate, msg("res.v.date")),
  time: z.string().refine(isLocalTime, msg("res.v.time")),
  partySize: z.coerce.number().int().min(1).max(200),
});

export async function modifyByRestaurantAction(slug: string, reservationId: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { restaurant, user } = await requireRestaurantAccess(slug);
    const data = modifySchema.parse(formObject(formData));
    const { emailIds } = await modifyReservation({ reservationId, restaurantId: restaurant.id, ...data, by: "RESTAURANT", userId: user.id });
    after(() => dispatchEmails(emailIds));
    refresh(slug);
    return t("res.modified");
  });
}

export async function updateInternalNotesAction(slug: string, reservationId: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { tdb } = await requireRestaurantAccess(slug);
    const notes = z.string().max(1000).optional().parse(formObject(formData).internalNotes);
    await tdb.reservation.update({ where: { id: reservationId }, data: { internalNotes: notes ?? null } });
    refresh(slug);
    return t("res.noteSaved");
  });
}

export async function releaseTablesAction(slug: string, reservationId: string) {
  return runAction(async (t) => {
    const { restaurant, user } = await requireRestaurantAccess(slug);
    await releaseTablesNow({ restaurantId: restaurant.id, reservationId, userId: user.id });
    refresh(slug);
    return t("res.tablesReleased");
  });
}

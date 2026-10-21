"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocalDate, isLocalTime } from "@/server/availability/time";
import { dispatchEmails } from "@/server/email/outbox";
import { ReservationError, type ReservationErrorCode } from "@/server/reservations/errors";
import { cancelReservation, findReservationByToken, modifyReservation } from "@/server/reservations/manage";

export type ManageActionResult = { ok: true } | { ok: false; code: ReservationErrorCode | "INVALID" };

/** Storno durch den Gast über den Link aus der E-Mail. */
export async function cancelByGuestAction(token: string): Promise<ManageActionResult> {
  const r = await findReservationByToken(token);
  if (!r) return { ok: false, code: "NOT_FOUND" };
  try {
    const { emailIds } = await cancelReservation({ reservationId: r.id, restaurantId: r.restaurantId, by: "GUEST" });
    after(() => dispatchEmails(emailIds));
    revalidatePath(`/r/${r.restaurant.slug}/m/${token}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ReservationError) return { ok: false, code: error.code };
    throw error;
  }
}

const modifySchema = z.object({
  date: z.string().refine(isLocalDate),
  time: z.string().refine(isLocalTime),
  partySize: z.number().int().min(1).max(50),
});

/** Umbuchung durch den Gast (Datum, Uhrzeit, Personen). */
export async function modifyByGuestAction(token: string, input: unknown): Promise<ManageActionResult> {
  const parsed = modifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  const r = await findReservationByToken(token);
  if (!r) return { ok: false, code: "NOT_FOUND" };
  try {
    const { emailIds } = await modifyReservation({
      reservationId: r.id,
      restaurantId: r.restaurantId,
      ...parsed.data,
      by: "GUEST",
    });
    after(() => dispatchEmails(emailIds));
    revalidatePath(`/r/${r.restaurant.slug}/m/${token}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof ReservationError) return { ok: false, code: error.code };
    throw error;
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { msg } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { runAction, UserFacingError } from "@/server/http/admin-action";
import { eraseGuestData } from "@/server/privacy/anonymize";
import { requireRestaurantAccess } from "@/server/tenancy/access";

export async function eraseGuestAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async (t) => {
    const { restaurant, user } = await requireRestaurantAccess(slug, { ownerOnly: true });
    const email = z.string().email(msg("common.v.email")).parse(formData.get("email"));
    const confirm = formData.get("confirm");
    if (confirm !== "on") throw new UserFacingError("privacy.err.confirm");
    const count = await eraseGuestData(restaurant.id, email, user.id);
    revalidatePath(`/admin/${slug}`, "layout");
    return t("privacy.erased", { count });
  });
}

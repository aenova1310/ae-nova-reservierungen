"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/server/http/admin-action";
import { saveFloorplan, type Floorplan } from "@/server/floorplan/service";
import { getAdminT } from "@/server/i18n";
import { requireRestaurantAccess } from "@/server/tenancy/access";

export type SaveFloorplanResult = NonNullable<ActionResult> & { plan?: Floorplan };

/** Speichert den Raumplan; liefert den gespeicherten Stand (mit neuer Version) zurück. */
export async function saveFloorplanAction(slug: string, payload: unknown): Promise<SaveFloorplanResult> {
  let plan: Floorplan | undefined;
  const result = await runAction(async (t) => {
    const { restaurant, user } = await requireRestaurantAccess(slug);
    plan = await saveFloorplan(restaurant, payload, user.id);
    revalidatePath(`/admin/${slug}`, "layout");
    return t("fp.saved");
  });
  return result?.ok ? { ...result, plan } : (result ?? { ok: false, error: (await getAdminT()).t("fp.saveFailed") });
}

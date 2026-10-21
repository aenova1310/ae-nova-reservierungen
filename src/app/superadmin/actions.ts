"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { formObject, runAction, UserFacingError } from "@/server/http/admin-action";
import { createTenant, setTenantPlan, setTenantStatus, TenantError, updatePlanPrice } from "@/server/superadmin/tenants";
import { requireSuperAdmin } from "@/server/tenancy/access";

const createSchema = z.object({
  organizationName: z.string().min(2, "Name des Betriebs fehlt").max(120),
  restaurantName: z.string().min(2, "Name fehlt").max(80),
  slug: z.string().min(3, "Mindestens 3 Zeichen").max(40),
  restaurantEmail: z.string().email("Ungültige E-Mail"),
  city: z.string().max(60).optional(),
  planCode: z.enum(["BASIC", "PRO"]),
  ownerName: z.string().min(2, "Name fehlt").max(80),
  ownerEmail: z.string().email("Ungültige E-Mail"),
  ownerPassword: z.string().min(PASSWORD_MIN_LENGTH, `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`),
});

export async function createTenantAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let slug = "";
  const result = await runAction(async () => {
    await requireSuperAdmin();
    const data = createSchema.parse(formObject(formData));
    try {
      const { restaurant } = await createTenant(data);
      slug = restaurant.slug;
    } catch (error) {
      if (error instanceof TenantError) throw new UserFacingError(error.message);
      throw error;
    }
  });
  if (result?.ok) {
    revalidatePath("/superadmin");
    redirect(`/superadmin?neu=${slug}`);
  }
  return result;
}

export async function setStatusAction(restaurantId: string, status: "ACTIVE" | "SUSPENDED") {
  return runAction(async () => {
    const user = await requireSuperAdmin();
    await setTenantStatus(restaurantId, status, user.id);
    revalidatePath("/superadmin");
    return status === "SUSPENDED" ? "Restaurant gesperrt – Online-Buchungen sind deaktiviert." : "Restaurant freigeschaltet.";
  });
}

export async function setPlanAction(restaurantId: string, planCode: "BASIC" | "PRO") {
  return runAction(async () => {
    const user = await requireSuperAdmin();
    await setTenantPlan(restaurantId, planCode, user.id);
    revalidatePath("/superadmin");
    return `Tarif auf ${planCode === "PRO" ? "Pro" : "Basic"} geändert.`;
  });
}

const priceSchema = z.object({
  name: z.string().min(2).max(40),
  price: z
    .string()
    .transform((v) => Number(v.replace(",", ".")))
    .pipe(z.number().min(0, "Preis ≥ 0").max(10_000)),
});

export async function updatePriceAction(code: "BASIC" | "PRO", _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    await requireSuperAdmin();
    const data = priceSchema.parse(formObject(formData));
    await updatePlanPrice(code, Math.round(data.price * 100), data.name);
    revalidatePath("/superadmin", "layout");
    return `Preis für ${data.name} gespeichert.`;
  });
}

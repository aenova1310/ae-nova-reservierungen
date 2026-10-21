"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { msg, type AdminT } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { AccountError, inviteMember, resendInvitation, revokeInvitation } from "@/server/auth/account";
import { db } from "@/server/db";
import { formObject, runAction, UserFacingError } from "@/server/http/admin-action";
import { getAdminT } from "@/server/i18n";
import { requireRestaurantAccess } from "@/server/tenancy/access";

const inviteSchema = z.object({
  email: z.string().trim().email(msg("common.v.email")).transform((e) => e.toLowerCase()),
  role: z.enum(["STAFF", "OWNER"]),
});

/** Kontext für Einladungen: Tarif-Gate (Basic: genau ein Zugang) prüft der Konto-Service. */
async function inviteContext(slug: string) {
  const { restaurant, user } = await requireRestaurantAccess(slug, { ownerOnly: true });
  const { locale } = await getAdminT();
  return {
    locale,
    organizationId: restaurant.organizationId,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    planCode: restaurant.planCode,
    invitedByName: user.name ?? user.email,
  };
}

/** Konto-Fehler als Meldung anzeigen. */
async function accountAction(fn: (t: AdminT) => Promise<string>) {
  return runAction(async (t) => {
    try {
      return await fn(t);
    } catch (error) {
      if (error instanceof AccountError) throw new UserFacingError(error.message);
      throw error;
    }
  });
}

export async function inviteMemberAction(slug: string, _prev: ActionResult, formData: FormData) {
  return accountAction(async (t) => {
    const ctx = await inviteContext(slug);
    const data = inviteSchema.parse(formObject(formData));
    await inviteMember(ctx, data.email, data.role);
    revalidatePath(`/admin/${slug}/team`);
    return t("team.invited", { email: data.email });
  });
}

export async function resendInvitationAction(slug: string, invitationId: string) {
  return accountAction(async (t) => {
    const email = await resendInvitation(await inviteContext(slug), invitationId);
    revalidatePath(`/admin/${slug}/team`);
    return t("team.reinvited", { email });
  });
}

export async function revokeInvitationAction(slug: string, invitationId: string) {
  return accountAction(async (t) => {
    const { organizationId } = await inviteContext(slug);
    await revokeInvitation(organizationId, invitationId);
    revalidatePath(`/admin/${slug}/team`);
    return t("team.revoked");
  });
}

export async function removeMemberAction(slug: string, membershipId: string) {
  return runAction(async (t) => {
    const { restaurant, user } = await requireRestaurantAccess(slug, { ownerOnly: true });
    const membership = await db.membership.findFirst({ where: { id: membershipId, organizationId: restaurant.organizationId } });
    if (!membership) throw new UserFacingError("team.err.notFound");
    if (membership.userId === user.id) throw new UserFacingError("team.err.self");
    if (membership.role === "OWNER") {
      const owners = await db.membership.count({ where: { organizationId: restaurant.organizationId, role: "OWNER" } });
      if (owners <= 1) throw new UserFacingError("team.err.lastOwner");
    }
    await db.membership.delete({ where: { id: membership.id } });
    // Offene Sessions des entfernten Benutzers beenden, falls er keinem Betrieb mehr angehört
    const remaining = await db.membership.count({ where: { userId: membership.userId } });
    if (remaining === 0) await db.session.deleteMany({ where: { userId: membership.userId } });
    revalidatePath(`/admin/${slug}/team`);
    return t("team.removed");
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { db } from "@/server/db";
import { formObject, runAction, UserFacingError } from "@/server/http/admin-action";
import { maxMembers } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";

const memberSchema = z.object({
  name: z.string().min(2, "Name fehlt").max(80),
  email: z.string().email("Ungültige E-Mail").transform((e) => e.toLowerCase()),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`),
  role: z.enum(["STAFF", "OWNER"]),
});

/**
 * Mitarbeiter-Zugang anlegen. Tarif-Gate serverseitig: Basic erlaubt genau einen
 * Zugang (den Inhaber), Pro unbegrenzt.
 */
export async function addMemberAction(slug: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const { restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
    const data = memberSchema.parse(formObject(formData));
    const count = await db.membership.count({ where: { organizationId: restaurant.organizationId } });
    if (count >= maxMembers(restaurant.planCode)) {
      throw new UserFacingError("Im Basic-Tarif ist ein Admin-Zugang enthalten. Für weitere Mitarbeiter-Zugänge bitte auf Pro wechseln.");
    }
    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) {
      const already = await db.membership.findUnique({
        where: { userId_organizationId: { userId: existing.id, organizationId: restaurant.organizationId } },
      });
      if (already) throw new UserFacingError("Diese Person hat bereits Zugang.");
      // Bestehendes Konto (z. B. aus anderem Betrieb): Passwort nicht überschreiben
      await db.membership.create({ data: { userId: existing.id, organizationId: restaurant.organizationId, role: data.role } });
    } else {
      await db.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash: await hashPassword(data.password),
          memberships: { create: { organizationId: restaurant.organizationId, role: data.role } },
        },
      });
    }
    revalidatePath(`/admin/${slug}/team`);
    return `Zugang für ${data.email} angelegt. Bitte das Startpasswort persönlich weitergeben.`;
  });
}

export async function removeMemberAction(slug: string, membershipId: string) {
  return runAction(async () => {
    const { restaurant, user } = await requireRestaurantAccess(slug, { ownerOnly: true });
    const membership = await db.membership.findFirst({ where: { id: membershipId, organizationId: restaurant.organizationId } });
    if (!membership) throw new UserFacingError("Zugang nicht gefunden.");
    if (membership.userId === user.id) throw new UserFacingError("Sie können sich nicht selbst entfernen.");
    if (membership.role === "OWNER") {
      const owners = await db.membership.count({ where: { organizationId: restaurant.organizationId, role: "OWNER" } });
      if (owners <= 1) throw new UserFacingError("Es muss mindestens eine Inhaberin/ein Inhaber bleiben.");
    }
    await db.membership.delete({ where: { id: membership.id } });
    // Offene Sessions des entfernten Benutzers beenden, falls er keinem Betrieb mehr angehört
    const remaining = await db.membership.count({ where: { userId: membership.userId } });
    if (remaining === 0) await db.session.deleteMany({ where: { userId: membership.userId } });
    revalidatePath(`/admin/${slug}/team`);
    return "Zugang entfernt.";
  });
}

import "server-only";
import { forbidden, notFound, redirect } from "next/navigation";
import { db } from "../db";
import { getSessionUser, type SessionUser } from "../auth/session";
import { tenantDb, type TenantDb } from "./tenant-db";

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.platformRole !== "SUPER_ADMIN") forbidden();
  return user;
}

export type AccessRole = "OWNER" | "STAFF";

export interface RestaurantAccess {
  user: SessionUser;
  role: AccessRole;
  restaurant: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    planCode: "BASIC" | "PRO";
    status: "ACTIVE" | "SUSPENDED";
    organizationId: string;
  };
  tdb: TenantDb;
}

/**
 * Löst den Mandanten für Admin-Seiten/-Actions auf:
 * Session → Restaurant per Slug → Membership in der Organisation.
 * Super-Admins haben Owner-Rechte auf alle Restaurants (Support).
 */
export async function requireRestaurantAccess(slug: string, opts: { ownerOnly?: boolean } = {}): Promise<RestaurantAccess> {
  const user = await requireUser();
  const restaurant = await db.restaurant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, timezone: true, planCode: true, status: true, organizationId: true },
  });
  if (!restaurant) notFound();

  let role: AccessRole;
  if (user.platformRole === "SUPER_ADMIN") {
    role = "OWNER";
  } else {
    const membership = await db.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: restaurant.organizationId } },
    });
    if (!membership) notFound(); // nicht verraten, dass es das Restaurant gibt
    role = membership.role;
  }
  if (opts.ownerOnly && role !== "OWNER") forbidden();

  return { user, role, restaurant, tdb: tenantDb(restaurant.id) };
}

/** Alle Restaurants, auf die der Benutzer Zugriff hat (für Login-Weiterleitung und Umschalter). */
export async function accessibleRestaurants(user: SessionUser) {
  if (user.platformRole === "SUPER_ADMIN") {
    return db.restaurant.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } });
  }
  return db.restaurant.findMany({
    where: { organization: { memberships: { some: { userId: user.id } } } },
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminT } from "@/server/i18n";
import { accessibleRestaurants, requireUser } from "@/server/tenancy/access";

/** Einstieg: direkt zum (einzigen) Restaurant, sonst Auswahl. */
export default async function AdminIndexPage() {
  const user = await requireUser();
  // Anbieter landen in der Mandantenübersicht
  if (user.platformRole === "SUPER_ADMIN") redirect("/superadmin");
  const restaurants = await accessibleRestaurants(user);
  const { t } = await getAdminT();
  if (restaurants.length === 1) redirect(`/admin/${restaurants[0].slug}`);

  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="text-2xl font-medium">{t("nav.chooseRestaurant")}</h1>
      {restaurants.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{t("nav.noRestaurant")}</p>
      ) : (
        <ul className="mt-6 divide-y rounded-md border bg-card">
          {restaurants.map((r) => (
            <li key={r.slug}>
              <Link href={`/admin/${r.slug}`} className="block px-4 py-3 hover:bg-muted">
                {r.name} <span className="text-sm text-muted-foreground">/{r.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

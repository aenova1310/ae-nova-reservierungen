import Link from "next/link";
import { logoutAction } from "@/app/admin/login/actions";
import { AdminNav, type NavItem } from "@/components/admin/admin-nav";
import { LanguageSwitch } from "@/components/admin/language-switch";
import { MobileNav } from "@/components/admin/mobile-nav";
import { Badge } from "@/components/ui/badge";
import { getAdminT } from "@/server/i18n";
import { accessibleRestaurants, requireRestaurantAccess } from "@/server/tenancy/access";

const NAV: NavItem[] = [
  { href: "", label: "nav.today", icon: "today" },
  { href: "/reservierungen", label: "nav.reservations", icon: "list" },
  { href: "/timeline", label: "nav.timeline", icon: "timeline" },
  { href: "/statistik", label: "nav.stats", icon: "stats" },
  { href: "/tische", label: "nav.tables", icon: "tables" },
  { href: "/raumplan", label: "nav.floorplan", icon: "floorplan" },
  { href: "/oeffnungszeiten", label: "nav.hours", icon: "hours" },
  { href: "/einstellungen", label: "nav.settings", icon: "settings", ownerOnly: true },
  { href: "/einbinden", label: "nav.embed", icon: "embed" },
  { href: "/datenschutz", label: "nav.privacy", icon: "privacy", ownerOnly: true },
  { href: "/team", label: "nav.team", icon: "team", ownerOnly: true },
];

export default async function RestaurantAdminLayout(props: LayoutProps<"/admin/[restaurant]">) {
  const { restaurant: slug } = await props.params;
  const { user, role, restaurant } = await requireRestaurantAccess(slug);
  const { t } = await getAdminT();
  const items = NAV.filter((i) => !i.ownerOnly || role === "OWNER");
  const others = (await accessibleRestaurants(user)).filter((r) => r.slug !== slug);
  const base = `/admin/${slug}`;

  const footer = (
    <div className="space-y-3 px-3 text-sm">
      {others.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">{t("nav.switchRestaurant")}</summary>
          <ul className="mt-2 space-y-1">
            {others.slice(0, 8).map((r) => (
              <li key={r.slug}>
                <Link href={`/admin/${r.slug}`} className="hover:underline">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="truncate text-muted-foreground" title={user.email}>
        {user.name ?? user.email}
        <span className="block text-xs">{t(`common.role.${role}`)}</span>
      </p>
      {user.platformRole === "SUPER_ADMIN" ? (
        <Link href="/superadmin" className="block text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("nav.superadmin")}
        </Link>
      ) : null}
      <LanguageSwitch />
      <form action={logoutAction}>
        <button type="submit" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("nav.logout")}
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card px-3 py-5 lg:flex">
        <div className="mb-6 px-3">
          <p className="truncate font-serif text-lg leading-tight">{restaurant.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              {restaurant.planCode === "PRO" ? "Pro" : "Basic"}
            </Badge>
            {restaurant.status === "SUSPENDED" ? <Badge variant="destructive">{t("nav.suspended")}</Badge> : null}
          </div>
        </div>
        <AdminNav base={base} items={items} />
        <div className="mt-auto border-t pt-4">{footer}</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b bg-card px-3 py-2 lg:hidden">
          <MobileNav base={base} items={items} title={restaurant.name} footer={footer} />
          <span className="truncate font-serif">{restaurant.name}</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{props.children}</main>
      </div>
    </div>
  );
}

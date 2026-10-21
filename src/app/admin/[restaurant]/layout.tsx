import Link from "next/link";
import { logoutAction } from "@/app/admin/login/actions";
import { AdminNav, type NavItem } from "@/components/admin/admin-nav";
import { MobileNav } from "@/components/admin/mobile-nav";
import { Badge } from "@/components/ui/badge";
import { accessibleRestaurants, requireRestaurantAccess } from "@/server/tenancy/access";

const NAV: NavItem[] = [
  { href: "", label: "Heute", icon: "today" },
  { href: "/reservierungen", label: "Reservierungen", icon: "list" },
  { href: "/timeline", label: "Tagesplan", icon: "timeline" },
  { href: "/statistik", label: "Statistik", icon: "stats" },
  { href: "/tische", label: "Tische & Bereiche", icon: "tables" },
  { href: "/raumplan", label: "Raumplan", icon: "floorplan" },
  { href: "/oeffnungszeiten", label: "Öffnungszeiten", icon: "hours" },
  { href: "/einstellungen", label: "Einstellungen", icon: "settings", ownerOnly: true },
  { href: "/einbinden", label: "Website-Einbindung", icon: "embed" },
  { href: "/datenschutz", label: "Datenschutz", icon: "privacy", ownerOnly: true },
  { href: "/team", label: "Team", icon: "team", ownerOnly: true },
];

export default async function RestaurantAdminLayout(props: LayoutProps<"/admin/[restaurant]">) {
  const { restaurant: slug } = await props.params;
  const { user, role, restaurant } = await requireRestaurantAccess(slug);
  const items = NAV.filter((i) => !i.ownerOnly || role === "OWNER");
  const others = (await accessibleRestaurants(user)).filter((r) => r.slug !== slug);
  const base = `/admin/${slug}`;

  const footer = (
    <div className="space-y-3 px-3 text-sm">
      {others.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-muted-foreground">Restaurant wechseln</summary>
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
        <span className="block text-xs">{role === "OWNER" ? "Inhaber/in" : "Mitarbeiter/in"}</span>
      </p>
      {user.platformRole === "SUPER_ADMIN" ? (
        <Link href="/superadmin" className="block text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Zur Anbieter-Übersicht
        </Link>
      ) : null}
      <form action={logoutAction}>
        <button type="submit" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Abmelden
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
            {restaurant.status === "SUSPENDED" ? <Badge variant="destructive">Gesperrt</Badge> : null}
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

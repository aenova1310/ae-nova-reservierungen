import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/app/admin/login/actions";
import { requireSuperAdmin } from "@/server/tenancy/access";

export const metadata: Metadata = { title: "Super-Admin", robots: { index: false } };

const NAV = [
  { href: "/superadmin", label: "Mandanten" },
  { href: "/superadmin/neu", label: "Restaurant anlegen" },
  { href: "/superadmin/tarife", label: "Tarife & Preise" },
];

export default async function SuperAdminLayout({ children }: LayoutProps<"/superadmin">) {
  const user = await requireSuperAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-b bg-[#1d2433] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <span className="font-serif text-lg">A&amp;E NOVA · Anbieter</span>
          <nav aria-label="Super-Admin" className="flex flex-wrap gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-white/80 underline-offset-4 hover:text-white hover:underline">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction} className="ml-auto flex items-center gap-3 text-sm text-white/70">
            <span className="hidden sm:inline">{user.email}</span>
            <button type="submit" className="underline-offset-4 hover:text-white hover:underline">Abmelden</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden", robots: { index: false } };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/admin");
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <p className="font-serif text-lg">A&amp;E NOVA Reservierungen</p>
        <h1 className="mt-8 text-2xl font-medium">Anmelden</h1>
        <p className="mt-1 text-sm text-muted-foreground">Zugang für Restaurant-Teams.</p>
        <LoginForm />
        <p className="mt-4 text-center text-sm">
          <Link href="/admin/passwort-vergessen" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Passwort vergessen?
          </Link>
        </p>
      </div>
    </main>
  );
}

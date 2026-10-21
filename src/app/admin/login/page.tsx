import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
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
      </div>
    </main>
  );
}

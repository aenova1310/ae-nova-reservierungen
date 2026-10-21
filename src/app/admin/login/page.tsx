import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getSessionUser } from "@/server/auth/session";
import { getAdminT } from "@/server/i18n";
import Link from "next/link";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminT();
  return { title: t("auth.login.title"), robots: { index: false } };
}

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/admin");
  const { t } = await getAdminT();
  return (
    <AuthShell title={t("auth.login.title")} description={t("auth.login.description")}>
        <LoginForm />
        <p className="mt-4 text-center text-sm">
          <Link href="/admin/passwort-vergessen" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t("auth.login.forgot")}
          </Link>
        </p>
    </AuthShell>
  );
}

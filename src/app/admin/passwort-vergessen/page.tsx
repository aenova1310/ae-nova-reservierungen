import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getAdminT } from "@/server/i18n";
import { requestResetAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminT();
  return { title: t("auth.forgot.title"), robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const { t } = await getAdminT();
  return (
    <AuthShell title={t("auth.forgot.title")} description={t("auth.forgot.description")}>
      <AuthForm
        action={requestResetAction}
        fields={[{ name: "email", label: t("auth.email"), type: "email", autoComplete: "username" }]}
        submitLabel={t("auth.forgot.submit")}
        footer={
          <p className="text-center text-sm">
            <Link href="/admin/login" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {t("auth.backToLogin")}
            </Link>
          </p>
        }
      />
    </AuthShell>
  );
}

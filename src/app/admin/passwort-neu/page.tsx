import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { resetTokenEmail } from "@/server/auth/account";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { getAdminT } from "@/server/i18n";
import { resetPasswordAction } from "./actions";

// Kein Referrer: das Token in der Adresse soll nicht an andere Seiten weitergegeben werden
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminT();
  return { title: t("auth.reset.metaTitle"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function NewPasswordPage(props: PageProps<"/admin/passwort-neu">) {
  const { token } = await props.searchParams;
  const value = typeof token === "string" ? token : "";
  const email = await resetTokenEmail(value);
  const { t } = await getAdminT();

  if (!email) {
    return (
      <AuthShell title={t("auth.reset.invalidTitle")} description={t("auth.reset.invalidDescription")}>
        <p className="mt-8 text-sm">
          <Link href="/admin/passwort-vergessen" className="underline underline-offset-4">
            {t("auth.reset.requestNew")}
          </Link>
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t("auth.reset.title")} description={t("auth.reset.description")}>
      <AuthForm
        action={resetPasswordAction.bind(null, value)}
        fields={[
          { name: "email", label: t("auth.email"), type: "email", autoComplete: "username", defaultValue: email, readOnly: true },
          { name: "password", label: t("auth.reset.newPassword"), type: "password", autoComplete: "new-password", minLength: PASSWORD_MIN_LENGTH, hint: t("auth.passwordHint", { min: PASSWORD_MIN_LENGTH }) },
          { name: "confirm", label: t("auth.reset.repeat"), type: "password", autoComplete: "new-password" },
        ]}
        submitLabel={t("auth.reset.submit")}
      />
    </AuthShell>
  );
}

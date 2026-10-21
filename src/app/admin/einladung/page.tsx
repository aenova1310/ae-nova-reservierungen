import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { invitationView } from "@/server/auth/account";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { getAdminT } from "@/server/i18n";
import { acceptInvitationAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getAdminT();
  return { title: t("auth.invite.metaTitle"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function InvitationPage(props: PageProps<"/admin/einladung">) {
  const { token } = await props.searchParams;
  const value = typeof token === "string" ? token : "";
  const invitation = await invitationView(value);
  const { t } = await getAdminT();

  if (!invitation) {
    return (
      <AuthShell title={t("auth.invite.invalidTitle")} description={t("auth.invite.invalidDescription")}>
        <p className="mt-8 text-sm text-muted-foreground">
          {t("auth.invite.invalidHelp")}{" "}
          <Link href="/admin/login" className="text-foreground underline underline-offset-4">
            {t("auth.invite.toLogin")}
          </Link>
        </p>
      </AuthShell>
    );
  }

  const role = t(`common.role.${invitation.role}`);
  const email = { name: "email", label: t("auth.email"), type: "email" as const, autoComplete: "username", defaultValue: invitation.email, readOnly: true };
  return (
    <AuthShell
      title={t("auth.invite.title", { restaurant: invitation.restaurantName })}
      description={
        invitation.existingAccount
          ? t("auth.invite.existing", { role })
          : t("auth.invite.new", { role })
      }
    >
      <AuthForm
        action={acceptInvitationAction.bind(null, value, invitation.existingAccount)}
        fields={
          invitation.existingAccount
            ? [email, { name: "password", label: t("auth.invite.yourPassword"), type: "password", autoComplete: "current-password" }]
            : [
                { name: "name", label: t("auth.invite.name"), autoComplete: "name" },
                email,
                { name: "password", label: t("auth.password"), type: "password", autoComplete: "new-password", minLength: PASSWORD_MIN_LENGTH, hint: t("auth.passwordHint", { min: PASSWORD_MIN_LENGTH }) },
                { name: "confirm", label: t("auth.reset.repeat"), type: "password", autoComplete: "new-password" },
              ]
        }
        submitLabel={t("auth.invite.submit")}
      />
    </AuthShell>
  );
}

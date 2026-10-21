import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { invitationView } from "@/server/auth/account";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { acceptInvitationAction } from "./actions";

export const metadata: Metadata = { title: "Einladung", robots: { index: false }, referrer: "no-referrer" };

export default async function InvitationPage(props: PageProps<"/admin/einladung">) {
  const { token } = await props.searchParams;
  const value = typeof token === "string" ? token : "";
  const invitation = await invitationView(value);

  if (!invitation) {
    return (
      <AuthShell title="Einladung ungültig" description="Die Einladung ist abgelaufen, wurde zurückgezogen oder bereits angenommen.">
        <p className="mt-8 text-sm text-muted-foreground">
          Bitten Sie das Restaurant um eine neue Einladung. Bereits angenommen?{" "}
          <Link href="/admin/login" className="text-foreground underline underline-offset-4">
            Zur Anmeldung
          </Link>
        </p>
      </AuthShell>
    );
  }

  const role = invitation.role === "OWNER" ? "Inhaber/in" : "Mitarbeiter/in";
  const email = { name: "email", label: "E-Mail", type: "email" as const, autoComplete: "username", defaultValue: invitation.email, readOnly: true };
  return (
    <AuthShell
      title={`Willkommen bei ${invitation.restaurantName}`}
      description={
        invitation.existingAccount
          ? `Sie wurden als ${role} eingeladen. Für diese Adresse gibt es schon ein Konto – bitte bestätigen Sie mit Ihrem Passwort.`
          : `Sie wurden als ${role} eingeladen. Legen Sie Ihr Passwort fest, um loszulegen.`
      }
    >
      <AuthForm
        action={acceptInvitationAction.bind(null, value, invitation.existingAccount)}
        fields={
          invitation.existingAccount
            ? [email, { name: "password", label: "Ihr Passwort", type: "password", autoComplete: "current-password" }]
            : [
                { name: "name", label: "Ihr Name", autoComplete: "name" },
                email,
                { name: "password", label: "Passwort", type: "password", autoComplete: "new-password", minLength: PASSWORD_MIN_LENGTH, hint: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.` },
                { name: "confirm", label: "Passwort wiederholen", type: "password", autoComplete: "new-password" },
              ]
        }
        submitLabel="Einladung annehmen"
      />
    </AuthShell>
  );
}

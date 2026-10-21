import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { resetTokenEmail } from "@/server/auth/account";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { resetPasswordAction } from "./actions";

// Kein Referrer: das Token in der Adresse soll nicht an andere Seiten weitergegeben werden
export const metadata: Metadata = { title: "Neues Passwort", robots: { index: false }, referrer: "no-referrer" };

export default async function NewPasswordPage(props: PageProps<"/admin/passwort-neu">) {
  const { token } = await props.searchParams;
  const value = typeof token === "string" ? token : "";
  const email = await resetTokenEmail(value);

  if (!email) {
    return (
      <AuthShell title="Link ungültig" description="Der Link ist abgelaufen oder wurde bereits verwendet.">
        <p className="mt-8 text-sm">
          <Link href="/admin/passwort-vergessen" className="underline underline-offset-4">
            Neuen Link anfordern
          </Link>
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Neues Passwort festlegen" description="Danach sind Sie auf allen anderen Geräten abgemeldet.">
      <AuthForm
        action={resetPasswordAction.bind(null, value)}
        fields={[
          { name: "email", label: "E-Mail", type: "email", autoComplete: "username", defaultValue: email, readOnly: true },
          { name: "password", label: "Neues Passwort", type: "password", autoComplete: "new-password", minLength: PASSWORD_MIN_LENGTH, hint: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.` },
          { name: "confirm", label: "Passwort wiederholen", type: "password", autoComplete: "new-password" },
        ]}
        submitLabel="Passwort speichern"
      />
    </AuthShell>
  );
}

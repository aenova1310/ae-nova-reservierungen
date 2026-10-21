import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { requestResetAction } from "./actions";

export const metadata: Metadata = { title: "Passwort vergessen", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Passwort vergessen" description="Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort festlegen.">
      <AuthForm
        action={requestResetAction}
        fields={[{ name: "email", label: "E-Mail", type: "email", autoComplete: "username" }]}
        submitLabel="Link senden"
        footer={
          <p className="text-center text-sm">
            <Link href="/admin/login" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Zurück zur Anmeldung
            </Link>
          </p>
        }
      />
    </AuthShell>
  );
}

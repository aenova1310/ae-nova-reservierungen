import type { ReactNode } from "react";
import { LanguageSwitch } from "@/components/admin/language-switch";

/** Rahmen für Anmelde-, Passwort- und Einladungsseiten. */
export function AuthShell({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between gap-4">
          <p className="font-serif text-lg">A&amp;E NOVA Reservierungen</p>
          <LanguageSwitch />
        </div>
        <h1 className="mt-8 text-2xl font-medium">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {children}
      </div>
    </main>
  );
}

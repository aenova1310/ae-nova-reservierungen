"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

type Action = (state: ActionResult, formData: FormData) => Promise<ActionResult>;

const PendingContext = createContext(false);

/**
 * Formular für Server Actions mit Toast-Rückmeldung und Feldfehlern.
 *
 * Absenden erfolgt bewusst per onSubmit + startTransition statt `<form action>`:
 * React setzt Formulare nach einer Form-Action automatisch zurück – bei
 * Validierungsfehlern wären die Eingaben sonst weg. Zurückgesetzt wird nur bei
 * Erfolg und nur mit `resetOnSuccess`.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? "Gespeichert.");
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.();
    } else {
      toast.error(state.error);
    }
    // Feldfehler im DOM anzeigen
    formRef.current?.querySelectorAll<HTMLElement>("[data-field-error]").forEach((el) => {
      const msg = state && !state.ok ? state.fieldErrors?.[el.dataset.fieldError!] : undefined;
      el.textContent = msg ?? "";
      el.hidden = !msg;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur auf neue Ergebnisse reagieren
  }, [state]);

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={formRef}
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => formAction(formData));
        }}
      >
        {children}
      </form>
    </PendingContext.Provider>
  );
}

export function FieldError({ name }: { name: string }) {
  return <p data-field-error={name} hidden className="text-sm text-destructive" />;
}

export function SubmitButton({
  children,
  className,
  variant,
  size,
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "default" | "sm" | "lg";
}) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} className={cn(className)} aria-busy={pending}>
      {children}
    </Button>
  );
}

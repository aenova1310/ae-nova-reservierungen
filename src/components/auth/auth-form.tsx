"use client";

import { startTransition, useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";

export interface AuthField {
  name: string;
  label: string;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  minLength?: number;
  hint?: string;
  defaultValue?: string;
  readOnly?: boolean;
}

/**
 * Schlankes Formular für die öffentlichen Konto-Seiten. Erfolg zeigt die
 * Meldung statt des Formulars (bei Weiterleitung kommt es nicht dazu).
 */
export function AuthForm({
  action,
  fields,
  submitLabel,
  footer,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  fields: AuthField[];
  submitLabel: string;
  footer?: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, null);
  if (state?.ok) {
    return (
      <div className="mt-8 space-y-4">
        <p role="status" className="rounded-md border bg-card px-4 py-3 text-sm">
          {state.message}
        </p>
        {footer}
      </div>
    );
  }
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
    >
      {fields.map((f) => (
        <div key={f.name} className="space-y-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            minLength={f.minLength}
            defaultValue={f.defaultValue}
            readOnly={f.readOnly}
            required={!f.readOnly}
            aria-invalid={errors[f.name] ? true : undefined}
            aria-describedby={errors[f.name] || f.hint ? `${f.name}-desc` : undefined}
            className="h-10"
          />
          {errors[f.name] || f.hint ? (
            <p id={`${f.name}-desc`} className={errors[f.name] ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
              {errors[f.name] ?? f.hint}
            </p>
          ) : null}
        </div>
      ))}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} aria-busy={pending} className="h-10 w-full">
        {submitLabel}
      </Button>
      {footer}
    </form>
  );
}

"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";
import { createTenantAction } from "../actions";

export function CreateTenantForm({ appUrl }: { appUrl: string }) {
  const [state, action, pending] = useActionState(createTenantAction, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const err = (field: string) => (state && !state.ok ? state.fieldErrors?.[field] : undefined);

  const field = (id: string, label: string, props: React.ComponentProps<typeof Input>, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} aria-invalid={!!err(id)} aria-describedby={err(id) ? `${id}-err` : undefined} {...props} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {err(id) ? <p id={`${id}-err`} className="text-sm text-destructive">{err(id)}</p> : null}
    </div>
  );

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-medium">Restaurant</legend>
        {field("restaurantName", "Name", {
          required: true,
          value: name,
          onChange: (e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          },
        })}
        {field(
          "slug",
          "Slug (Adresse)",
          { required: true, value: slug, onChange: (e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); } },
          `${appUrl}/r/${slug || "…"}`,
        )}
        {field("restaurantEmail", "E-Mail für Benachrichtigungen", { type: "email", required: true })}
        {field("city", "Ort", {})}
        <div className="space-y-1.5">
          <Label htmlFor="planCode">Tarif</Label>
          <select id="planCode" name="planCode" defaultValue="BASIC" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="BASIC">Basic</option>
            <option value="PRO">Pro</option>
          </select>
        </div>
        {field("organizationName", "Betrieb (Vertragspartner)", { required: true, placeholder: "z. B. Romano Gastro GmbH" })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-medium">Inhaber-Zugang</legend>
        {field("ownerName", "Name", { required: true })}
        {field("ownerEmail", "E-Mail (Login)", { type: "email", required: true, autoComplete: "off" }, "Existiert das Konto schon, wird es nur mit dem neuen Betrieb verknüpft.")}
        {field("ownerPassword", "Startpasswort", { type: "text", required: true, minLength: 10, autoComplete: "new-password" }, "Persönlich weitergeben. Mindestens 10 Zeichen.")}
      </fieldset>

      {state && !state.ok ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>Restaurant anlegen</Button>
    </form>
  );
}

"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { ActionForm, FieldError, SubmitButton } from "./action-form";

interface SeatGroup {
  label: string;
  options: { value: string; label: string }[];
}

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function NewReservationDialog({
  action,
  seatGroups,
  today,
  nowTime,
  defaultSource = "PHONE",
  trigger,
}: {
  action: (state: ActionResult, formData: FormData) => Promise<ActionResult>;
  seatGroups: SeatGroup[];
  today: string;
  nowTime: string;
  defaultSource?: "PHONE" | "WALK_IN";
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"PHONE" | "WALK_IN" | "ADMIN">(defaultSource);
  const walkIn = source === "WALK_IN";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus aria-hidden /> Neue Reservierung
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{walkIn ? "Walk-in erfassen" : "Reservierung erfassen"}</DialogTitle>
          <DialogDescription>
            Ohne Tischauswahl vergibt das System den bestpassenden freien Tisch. Online-Kontingent und Vorlaufzeit gelten hier nicht.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="space-y-4" onSuccess={() => setOpen(false)}>
          <fieldset className="flex gap-2" aria-label="Art">
            {(
              [
                ["PHONE", "Telefon"],
                ["WALK_IN", "Walk-in"],
                ["ADMIN", "Sonstiges"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-secondary">
                <input type="radio" name="source" value={value} checked={source === value} onChange={() => setSource(value as typeof source)} />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nr-date">Datum</Label>
              <Input id="nr-date" name="date" type="date" defaultValue={today} required />
              <FieldError name="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nr-time">Uhrzeit</Label>
              <Input id="nr-time" name="time" type="time" step={300} defaultValue={walkIn ? nowTime : "19:00"} key={source} required />
              <FieldError name="time" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nr-party">Personen</Label>
              <Input id="nr-party" name="partySize" type="number" min={1} max={200} defaultValue={2} required />
              <FieldError name="partySize" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="nr-seat">Tisch</Label>
              <select id="nr-seat" name="seat" className={selectClass} defaultValue="">
                <option value="">Automatisch zuweisen</option>
                {seatGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nr-duration">Dauer (min)</Label>
              <Input id="nr-duration" name="durationMinutes" type="number" min={15} step={15} placeholder="Standard" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-name">Name</Label>
            <Input id="nr-name" name="name" required autoComplete="off" />
            <FieldError name="name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nr-phone">Telefon</Label>
              <Input id="nr-phone" name="phone" type="tel" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nr-email">E-Mail</Label>
              <Input id="nr-email" name="email" type="email" autoComplete="off" />
              <FieldError name="email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-notes">Anmerkung des Gastes</Label>
            <Textarea id="nr-notes" name="notes" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-internal">Interne Notiz</Label>
            <Textarea id="nr-internal" name="internalNotes" rows={2} placeholder="Nur für das Team sichtbar" />
          </div>
          {!walkIn ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notifyGuest" defaultChecked /> Bestätigung per E-Mail senden (falls E-Mail angegeben)
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <SubmitButton>{walkIn ? "Walk-in erfassen" : "Reservierung anlegen"}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

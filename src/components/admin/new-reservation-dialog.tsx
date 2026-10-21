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
import { useAdminT } from "./i18n-provider";

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
  const { t } = useAdminT();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"PHONE" | "WALK_IN" | "ADMIN">(defaultSource);
  const walkIn = source === "WALK_IN";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus aria-hidden /> {t("res.dialog.new")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{walkIn ? t("res.dialog.titleWalkIn") : t("res.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("res.dialog.description")}
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={action} className="space-y-4" onSuccess={() => setOpen(false)}>
          <fieldset className="flex gap-2" aria-label={t("res.dialog.kind")}>
            {(
              [
                ["PHONE", t("res.source.PHONE")],
                ["WALK_IN", t("res.source.WALK_IN")],
                ["ADMIN", t("res.dialog.other")],
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
              <Label htmlFor="nr-date">{t("res.f.date")}</Label>
              <Input id="nr-date" name="date" type="date" defaultValue={today} required />
              <FieldError name="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nr-time">{t("res.f.time")}</Label>
              <Input id="nr-time" name="time" type="time" step={300} defaultValue={walkIn ? nowTime : "19:00"} key={source} required />
              <FieldError name="time" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nr-party">{t("res.f.partySize")}</Label>
              <Input id="nr-party" name="partySize" type="number" min={1} max={200} defaultValue={2} required />
              <FieldError name="partySize" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="nr-seat">{t("res.f.table")}</Label>
              <select id="nr-seat" name="seat" className={selectClass} defaultValue="">
                <option value="">{t("res.dialog.autoAssign")}</option>
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
              <Label htmlFor="nr-duration">{t("res.dialog.duration")}</Label>
              <Input id="nr-duration" name="durationMinutes" type="number" min={15} step={15} placeholder={t("res.dialog.durationDefault")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-name">{t("res.f.name")}</Label>
            <Input id="nr-name" name="name" required autoComplete="off" />
            <FieldError name="name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nr-phone">{t("res.f.phone")}</Label>
              <Input id="nr-phone" name="phone" type="tel" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nr-email">{t("res.f.email")}</Label>
              <Input id="nr-email" name="email" type="email" autoComplete="off" />
              <FieldError name="email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-notes">{t("res.f.guestNotes")}</Label>
            <Textarea id="nr-notes" name="notes" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-internal">{t("res.f.internalNotes")}</Label>
            <Textarea id="nr-internal" name="internalNotes" rows={2} placeholder={t("res.dialog.internalHint")} />
          </div>
          {!walkIn ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="notifyGuest" defaultChecked /> {t("res.dialog.sendConfirmation")}
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <SubmitButton>{walkIn ? t("res.dialog.submitWalkIn") : t("res.dialog.submit")}</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

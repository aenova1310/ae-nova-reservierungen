"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { useAdminT } from "./i18n-provider";

/** Aktion mit Rückfrage (z. B. Löschen). Ohne `confirm` wird direkt ausgeführt. */
export function ConfirmAction({
  action,
  children,
  title,
  description,
  confirmLabel,
  variant = "ghost",
  size = "sm",
  destructive = false,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  title?: string;
  description?: string;
  confirmLabel?: string;
  variant?: "ghost" | "outline" | "destructive" | "secondary";
  size?: "sm" | "default" | "icon-sm";
  destructive?: boolean;
}) {
  const { t } = useAdminT();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const result = await action();
      if (result?.ok) {
        if (result.message) toast.success(result.message);
      } else if (result) toast.error(result.error);
      setOpen(false);
    });

  if (!title) {
    return (
      <Button type="button" variant={variant} size={size} disabled={pending} onClick={run}>
        {children}
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size} className={destructive ? "text-destructive hover:text-destructive" : undefined}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending} onClick={run}>
            {confirmLabel ?? t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

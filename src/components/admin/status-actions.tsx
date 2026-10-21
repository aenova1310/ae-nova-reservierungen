"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AdminKey } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { useAdminT } from "./i18n-provider";

const LABELS: Record<string, AdminKey> = {
  CONFIRMED: "res.action.CONFIRMED",
  DECLINED: "res.action.DECLINED",
  ARRIVED: "res.action.ARRIVED",
  NO_SHOW: "res.action.NO_SHOW",
};
const UNDO_LABELS: Record<string, AdminKey> = { CONFIRMED: "res.action.undoConfirmed" };

/** Schnellaktionen für Statuswechsel (Liste, Heute, Detail). */
export function StatusActions({
  current,
  allowed,
  onChange,
  size = "sm",
}: {
  current: string;
  allowed: string[];
  onChange: (to: string) => Promise<ActionResult>;
  size?: "sm" | "default";
}) {
  const { t } = useAdminT();
  const [pending, start] = useTransition();
  if (allowed.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowed.map((to) => (
        <Button
          key={to}
          size={size}
          variant={to === "NO_SHOW" || to === "DECLINED" ? "ghost" : "outline"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await onChange(to);
              if (result?.ok) toast.success(result.message ?? t("common.saved"));
              else if (result) toast.error(result.error);
            })
          }
        >
          {(current !== "REQUESTED" && UNDO_LABELS[to] && t(UNDO_LABELS[to])) || (LABELS[to] && t(LABELS[to])) || to}
        </Button>
      ))}
    </div>
  );
}

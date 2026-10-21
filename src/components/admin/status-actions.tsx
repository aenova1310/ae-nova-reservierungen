"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

const LABELS: Record<string, string> = {
  CONFIRMED: "Bestätigen",
  DECLINED: "Ablehnen",
  ARRIVED: "Eingetroffen",
  NO_SHOW: "No-Show",
};
const UNDO_LABELS: Record<string, string> = { CONFIRMED: "Zurück auf bestätigt" };

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
              if (result?.ok) toast.success(result.message ?? "Gespeichert.");
              else if (result) toast.error(result.error);
            })
          }
        >
          {(current !== "REQUESTED" && UNDO_LABELS[to]) || LABELS[to] || to}
        </Button>
      ))}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

export function ReleaseButton({ action }: { action: () => Promise<ActionResult> }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (r?.ok) toast.success(r.message ?? "Erledigt.");
          else if (r) toast.error(r.error);
        })
      }
    >
      Tisch jetzt freigeben
    </Button>
  );
}

"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminNav, type NavItem } from "./admin-nav";
import { useAdminT } from "./i18n-provider";

export function MobileNav({ base, items, title, footer }: { base: string; items: NavItem[]; title: string; footer: ReactNode }) {
  const { t } = useAdminT();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("nav.menu")}>
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetTitle className="mb-4 px-3 text-base">{title}</SheetTitle>
        <AdminNav base={base} items={items} onNavigate={() => setOpen(false)} />
        <div className="mt-6 border-t pt-4">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}

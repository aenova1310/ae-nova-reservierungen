"use client";

import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Clock,
  Code2,
  LayoutGrid,
  Map as MapIcon,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  ownerOnly?: boolean;
}

const ICONS: Record<string, LucideIcon> = {
  today: Sun,
  stats: BarChart3,
  list: ClipboardList,
  timeline: CalendarClock,
  tables: LayoutGrid,
  floorplan: MapIcon,
  hours: Clock,
  settings: Settings,
  embed: Code2,
  privacy: ShieldCheck,
  team: Users,
};

export function AdminNav({ base, items, onNavigate }: { base: string; items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.href === "" ? pathname === base : pathname.startsWith(href);
        const Icon = ICONS[item.icon];
        return (
          <Link
            key={item.href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

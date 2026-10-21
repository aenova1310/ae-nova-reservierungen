import type { CSSProperties, ReactNode } from "react";
import { widgetFontVar } from "@/lib/fonts";
import { cn } from "@/lib/utils";

const RADIUS = { sharp: "0.125rem", soft: "0.375rem", round: "0.75rem" } as const;

/**
 * Setzt das Restaurant-Branding als CSS-Variablen (siehe .nova-widget in globals.css).
 * Im Dunkelmodus wird die Markenfarbe aufgehellt, damit Buttons lesbar bleiben.
 */
export function WidgetTheme({
  branding,
  className,
  children,
}: {
  branding: { color: string; colorContrast: string; font: string; theme: string; corner: string };
  className?: string;
  children: ReactNode;
}) {
  const dark = branding.theme === "DARK";
  const style = {
    "--brand": dark ? `color-mix(in oklab, ${branding.color} 45%, white)` : branding.color,
    "--brand-contrast": dark ? "#14181f" : branding.colorContrast,
    "--font-widget-display": widgetFontVar(branding.font),
    "--radius": RADIUS[branding.corner as keyof typeof RADIUS] ?? RADIUS.soft,
  } as CSSProperties;
  return (
    <div className={cn("nova-widget bg-background text-foreground", dark && "dark", className)} style={style}>
      {children}
    </div>
  );
}

import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "A&E NOVA Reservierungen", template: "%s · A&E NOVA" },
  description: "Tischreservierungen für inhabergeführte Restaurants.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}

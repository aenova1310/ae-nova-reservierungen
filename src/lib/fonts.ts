import { Cormorant_Garamond, Fraunces, Instrument_Sans, Spectral } from "next/font/google";

// next/font lädt die Schriften zur Build-Zeit herunter und liefert sie von der
// eigenen Domain aus – keine Requests an Google aus dem Browser (DSGVO/TDDDG).

export const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-spectral",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const fontVariables = [instrumentSans, spectral, cormorant, fraunces]
  .map((f) => f.variable)
  .join(" ");

/** Kuratierte Schriftauswahl für das Widget (Schlüssel wird in Branding.fontFamily gespeichert). */
export const WIDGET_FONTS = {
  "serif-classic": { label: "Klassisch (Spectral)", cssVar: "var(--font-spectral)" },
  "serif-elegant": { label: "Elegant (Cormorant Garamond)", cssVar: "var(--font-cormorant)" },
  bistro: { label: "Bistro (Fraunces)", cssVar: "var(--font-fraunces)" },
  modern: { label: "Modern (Instrument Sans)", cssVar: "var(--font-instrument)" },
} as const;

export type WidgetFontKey = keyof typeof WIDGET_FONTS;

export function widgetFontVar(key: string): string {
  return (WIDGET_FONTS as Record<string, { cssVar: string }>)[key]?.cssVar ?? WIDGET_FONTS["serif-classic"].cssVar;
}

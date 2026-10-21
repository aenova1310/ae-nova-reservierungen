/** Farb-Hilfen für Restaurant-Branding (WCAG-Kontrast). */

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative Luminanz nach WCAG 2.1. */
export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Lesbare Textfarbe auf einer Fläche in `hex`: Weiß oder Tinte. */
export function readableOn(hex: string): "#ffffff" | "#1d2433" {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#1d2433") ? "#ffffff" : "#1d2433";
}

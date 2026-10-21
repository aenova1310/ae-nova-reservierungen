/** Einheitliches Ergebnis von Server Actions im Admin (für Toasts und Feldfehler). */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
  | null;

"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requestPasswordReset } from "@/server/auth/account";
import { rateLimit } from "@/server/auth/rate-limit";
import { hashToken } from "@/server/crypto";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben.") });

export async function requestResetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: "Bitte Eingabe prüfen.", fieldErrors: { email: parsed.error.issues[0].message } };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const perAddress = rateLimit(`reset:${hashToken(parsed.data.email)}`, 3, 60 * 60_000);
  const perIp = rateLimit(`reset-ip:${hashToken(ip)}`, 10, 60 * 60_000);
  if (!perIp.ok) return { ok: false, error: "Zu viele Anfragen. Bitte später erneut versuchen." };

  // Versand nach der Antwort: gleiche Antwortzeit, egal ob die Adresse registriert ist
  if (perAddress.ok) {
    after(() =>
      requestPasswordReset(parsed.data.email).catch((error) => console.error("[konto] Passwort-Mail fehlgeschlagen", error)),
    );
  }
  return {
    ok: true,
    message: `Falls zu ${parsed.data.email} ein Konto besteht, haben wir eine E-Mail mit einem Link gesendet. Er ist eine Stunde gültig. Bitte prüfen Sie auch den Spam-Ordner.`,
  };
}

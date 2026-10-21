"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { requestPasswordReset } from "@/server/auth/account";
import { rateLimit } from "@/server/auth/rate-limit";
import { hashToken } from "@/server/crypto";
import { getAdminT } from "@/server/i18n";
import { clientIp } from "@/server/http/request";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function requestResetAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { t } = await getAdminT();
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, error: t("common.checkInput"), fieldErrors: { email: t("auth.forgot.invalidEmail") } };

  const ip = clientIp(await headers());
  const perAddress = rateLimit(`reset:${hashToken(parsed.data.email)}`, 3, 60 * 60_000);
  const perIp = rateLimit(`reset-ip:${hashToken(ip)}`, 10, 60 * 60_000);
  if (!perIp.ok) return { ok: false, error: t("common.err.tooMany") };

  // Versand nach der Antwort: gleiche Antwortzeit, egal ob die Adresse registriert ist
  if (perAddress.ok) {
    after(() =>
      requestPasswordReset(parsed.data.email).catch((error) => console.error("[konto] Passwort-Mail fehlgeschlagen", error)),
    );
  }
  return {
    ok: true,
    message: t("auth.forgot.sent", { email: parsed.data.email }),
  };
}

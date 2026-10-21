"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { AccountError, acceptInvitation } from "@/server/auth/account";
import { newPasswordSchema } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";
import { fieldErrors } from "@/server/http/admin-action";

const newAccount = z.object({ name: z.string().trim().min(2, "Bitte Ihren Namen angeben").max(80) }).and(newPasswordSchema);

/** Einladung annehmen: neues Konto anlegen oder bestehendes mit Passwort bestätigen. */
export async function acceptInvitationAction(token: string, existing: boolean, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  let input: { name?: string; password: string };
  if (existing) {
    const password = String(formData.get("password") ?? "");
    if (!password) return { ok: false, error: "Bitte Ihr Passwort eingeben.", fieldErrors: { password: "Pflichtfeld" } };
    input = { password };
  } else {
    const parsed = newAccount.safeParse({ name: formData.get("name"), password: formData.get("password"), confirm: formData.get("confirm") });
    if (!parsed.success) return { ok: false, error: "Bitte Eingaben prüfen.", fieldErrors: fieldErrors(parsed.error) };
    input = parsed.data;
  }
  let result: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    result = await acceptInvitation(token, input);
  } catch (error) {
    if (error instanceof AccountError) return { ok: false, error: error.message };
    throw error;
  }
  // Ggf. mit anderem Konto angemeldet → durch das eingeladene ersetzen
  await destroySession();
  await createSession(result.userId, (await headers()).get("user-agent"));
  redirect(result.slug ? `/admin/${result.slug}` : "/admin");
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { msg, translateMessage } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { AccountError, acceptInvitation } from "@/server/auth/account";
import { newPasswordSchema } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";
import { fieldErrors } from "@/server/http/admin-action";
import { getAdminT } from "@/server/i18n";

const newAccount = z.object({ name: z.string().trim().min(2, msg("auth.invite.nameMissing")).max(80) }).and(newPasswordSchema);

/** Einladung annehmen: neues Konto anlegen oder bestehendes mit Passwort bestätigen. */
export async function acceptInvitationAction(token: string, existing: boolean, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { t } = await getAdminT();
  let input: { name?: string; password: string };
  if (existing) {
    const password = String(formData.get("password") ?? "");
    if (!password) return { ok: false, error: t("auth.invite.passwordMissing"), fieldErrors: { password: t("common.v.required") } };
    input = { password };
  } else {
    const parsed = newAccount.safeParse({ name: formData.get("name"), password: formData.get("password"), confirm: formData.get("confirm") });
    if (!parsed.success) return { ok: false, error: t("common.checkInput"), fieldErrors: fieldErrors(parsed.error, t) };
    input = parsed.data;
  }
  let result: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    result = await acceptInvitation(token, input);
  } catch (error) {
    if (error instanceof AccountError) return { ok: false, error: translateMessage(t, error.message) };
    throw error;
  }
  // Ggf. mit anderem Konto angemeldet → durch das eingeladene ersetzen
  await destroySession();
  await createSession(result.userId, (await headers()).get("user-agent"));
  redirect(result.slug ? `/admin/${result.slug}` : "/admin");
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { translateMessage } from "@/i18n/admin";
import type { ActionResult } from "@/lib/action-result";
import { AccountError, resetPassword } from "@/server/auth/account";
import { newPasswordSchema } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { fieldErrors } from "@/server/http/admin-action";
import { getAdminT } from "@/server/i18n";

export async function resetPasswordAction(token: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { t } = await getAdminT();
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { ok: false, error: t("common.checkInput"), fieldErrors: fieldErrors(parsed.error, t) };
  let userId: string;
  try {
    userId = await resetPassword(token, parsed.data.password);
  } catch (error) {
    if (error instanceof AccountError) return { ok: false, error: translateMessage(t, error.message) };
    throw error;
  }
  // Alle bisherigen Sitzungen sind beendet – auf diesem Gerät direkt neu anmelden
  await createSession(userId, (await headers()).get("user-agent"));
  redirect("/admin");
}

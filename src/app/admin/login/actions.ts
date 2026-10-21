"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { rateLimit } from "@/server/auth/rate-limit";
import { createSession, destroySession } from "@/server/auth/session";
import { hashToken } from "@/server/crypto";
import { clientIp } from "@/server/http/request";
import type { ActionResult } from "@/lib/action-result";
import { getAdminT } from "@/server/i18n";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

// Konstanter Dummy-Hash, damit unbekannte E-Mails gleich lange brauchen (kein User-Enumeration-Timing)
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$huXySnARaOLPR/mA/KiP5w$iqC6PJvmtaA8LF8Lr5Nf+afw7YtveomRTXTQr3lqdmk";

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { t } = await getAdminT();
  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: t("auth.login.missing") };

  const h = await headers();
  const ip = clientIp(h);
  const limit = rateLimit(`login:${hashToken(`${ip}:${parsed.data.email}`)}`, 8, 15 * 60_000);
  if (!limit.ok) return { ok: false, error: t("auth.login.tooMany") };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const valid = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, parsed.data.password);
  if (!user || !valid || user.disabledAt) return { ok: false, error: t("auth.login.wrong") };

  await createSession(user.id, h.get("user-agent"));
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

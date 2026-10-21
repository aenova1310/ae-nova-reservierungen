import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "../db";
import { hashToken, randomToken } from "../crypto";
import { env } from "../env";

/**
 * Server-seitige Sessions (Lucia-Muster): Das Cookie enthält ein zufälliges
 * Token, die Datenbank nur dessen SHA-256-Hash. Abmelden löscht die Zeile –
 * die Session ist damit sofort ungültig.
 */
export const SESSION_COOKIE = "nova_session";
const SESSION_DAYS = 30;

export async function createSession(userId: string, userAgent?: string | null): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 255) ?? null },
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure, sobald die App über HTTPS läuft (lokal mit http://localhost sonst kein Login möglich)
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  platformRole: "USER" | "SUPER_ADMIN";
  locale: "de" | "en";
}

/** Aktueller Benutzer oder null. Pro Request gecacht. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, platformRole: true, disabledAt: true, locale: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.disabledAt) return null;
  // lastSeenAt höchstens einmal pro Stunde schreiben
  if (Date.now() - session.lastSeenAt.getTime() > 3_600_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  const { id, email, name, platformRole, locale } = session.user;
  return { id, email, name, platformRole, locale: locale === "en" ? "en" : "de" };
});

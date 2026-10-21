import "server-only";
import { hashToken, randomToken } from "../crypto";
import { db } from "../db";
import { env } from "../env";
import { emailProvider } from "../email/provider";
import { renderMailHtml, renderMailText, type MailLayoutInput } from "../email/templates";
import { maxMembers, type PlanCode } from "../plans/features";
import { Prisma } from "@/generated/prisma/client";
import { hashPassword, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";

/**
 * Konten: "Passwort vergessen" und Einladungen für Mitarbeiter.
 *
 * Beide nutzen Einmal-Links: In der Datenbank liegt nur der SHA-256-Hash des
 * Tokens, der Klartext steht ausschließlich in der E-Mail. Diese Mails laufen
 * deshalb nicht über die Outbox (die Inhalte erst beim Versand aus der
 * Datenbank baut) – sie werden direkt gesendet und nur protokolliert.
 */
export class AccountError extends Error {}

export const RESET_TTL_MINUTES = 60;
export const INVITATION_TTL_DAYS = 7;

/**
 * Grenzen gegen Missbrauch als Mail-Relais (Absender ist unsere Domain, Text
 * enthält frei wählbare Namen): je Betrieb und je Empfänger, plus Obergrenze
 * offener Einladungen. Pro hat zwar unbegrenzte Zugänge, aber nicht unbegrenzte Mails.
 */
export const INVITE_LIMITS = { perOrgPerHour: 20, perRecipientPerDay: 5, maxOpen: 25 } as const;

type Role = "OWNER" | "STAFF";
const roleLabel = (role: Role) => (role === "OWNER" ? "Inhaber/in" : "Mitarbeiter/in");
const link = (path: string, token: string) => {
  const url = new URL(path, env().APP_URL);
  url.searchParams.set("token", token);
  return url.toString();
};

async function sendAccountMail(
  type: "PASSWORD_RESET" | "STAFF_INVITATION",
  to: string,
  layout: Omit<MailLayoutInput, "lang" | "brandColor" | "footer">,
  restaurantId: string | null = null,
) {
  const full: MailLayoutInput = { ...layout, lang: "de", brandColor: "#1d2433", footer: "A&E NOVA Reservierungen" };
  try {
    const result = await emailProvider().send({ to, subject: layout.heading, html: renderMailHtml(full), text: renderMailText(full) });
    // "direct:" – der Nachversand-Job fasst diese Einträge nicht an (Token ist nicht rekonstruierbar)
    await db.emailLog.create({ data: { type, restaurantId, status: "SENT", providerMessageId: `direct:${result.id}` } });
  } catch (error) {
    await db.emailLog.create({
      data: { type, restaurantId, status: "FAILED", providerMessageId: "direct", error: String(error instanceof Error ? error.message : error).slice(0, 500) },
    });
    throw new AccountError("Die E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.");
  }
}

// ─── Passwort vergessen ─────────────────────────────────────────────────────

/**
 * Sendet einen Link zum Zurücksetzen – nur wenn das Konto existiert und aktiv ist.
 * Der Aufrufer antwortet immer gleich (keine Rückschlüsse, ob eine Adresse registriert ist).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.disabledAt) return;
  const token = randomToken();
  await db.$transaction([
    // Nur der jüngste Link gilt
    db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    db.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000) },
    }),
  ]);
  await sendAccountMail("PASSWORD_RESET", user.email, {
    restaurantName: "A&E NOVA Reservierungen",
    heading: "Neues Passwort festlegen",
    greeting: `Guten Tag${user.name ? ` ${user.name}` : ""},`,
    paragraphs: [
      `für Ihr Konto wurde ein neues Passwort angefordert. Der Link ist ${RESET_TTL_MINUTES} Minuten gültig und kann einmal verwendet werden.`,
      "Falls Sie das nicht waren, ignorieren Sie diese E-Mail – Ihr Passwort bleibt unverändert.",
    ],
    cta: { label: "Passwort festlegen", url: link("/admin/passwort-neu", token) },
  });
}

async function findResetToken(token: string) {
  if (!token || token.length > 200) return null;
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, disabledAt: true } } },
  });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.user.disabledAt) return null;
  return row;
}

/** Für die Seite: Ist der Link noch gültig? (Gibt nur die E-Mail-Adresse zur Anzeige zurück.) */
export async function resetTokenEmail(token: string): Promise<string | null> {
  return (await findResetToken(token))?.user.email ?? null;
}

/** Setzt das Passwort, entwertet den Link und meldet alle Sitzungen ab. Liefert die User-ID. */
export async function resetPassword(token: string, password: string): Promise<string> {
  const row = await findResetToken(token);
  if (!row) throw new AccountError("Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.");
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    // Atomar einlösen: zwei gleichzeitige Anfragen mit demselben Link → nur eine gewinnt
    const used = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw new AccountError("Der Link wurde bereits verwendet.");
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null } });
  });
  return row.userId;
}

// ─── Einladungen ────────────────────────────────────────────────────────────

interface InviteContext {
  organizationId: string;
  restaurantId: string;
  restaurantName: string;
  planCode: PlanCode;
  invitedByName: string;
}

const openInvitations = (organizationId: string) => ({ organizationId, acceptedAt: null, expiresAt: { gt: new Date() } });

/** Zugänge + offene Einladungen dürfen das Tariflimit nicht überschreiten. */
async function assertSeat(ctx: InviteContext, excludeEmail?: string) {
  const [members, invites] = await Promise.all([
    db.membership.count({ where: { organizationId: ctx.organizationId } }),
    db.invitation.count({ where: { ...openInvitations(ctx.organizationId), NOT: excludeEmail ? { email: excludeEmail } : undefined } }),
  ]);
  if (members + invites >= maxMembers(ctx.planCode)) {
    throw new AccountError("Im Basic-Tarif ist ein Admin-Zugang enthalten. Für weitere Mitarbeiter-Zugänge bitte auf Pro wechseln.");
  }
}

async function mailInvitation(ctx: InviteContext, email: string, role: Role, token: string) {
  await sendAccountMail(
    "STAFF_INVITATION",
    email,
    {
      restaurantName: ctx.restaurantName,
      heading: `Einladung: ${ctx.restaurantName}`,
      greeting: "Guten Tag,",
      paragraphs: [
        `${ctx.invitedByName} lädt Sie als ${roleLabel(role)} in die Reservierungsverwaltung von ${ctx.restaurantName} ein.`,
        `Über den Link legen Sie Ihr Passwort fest. Er ist ${INVITATION_TTL_DAYS} Tage gültig.`,
      ],
      cta: { label: "Einladung annehmen", url: link("/admin/einladung", token) },
    },
    ctx.restaurantId,
  );
}

/** Einladung anlegen (oder für dieselbe Adresse erneuern) und versenden. */
export async function inviteMember(ctx: InviteContext, rawEmail: string, role: Role): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user && (await db.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: ctx.organizationId } } }))) {
    throw new AccountError("Diese Person hat bereits Zugang.");
  }
  await assertSeat(ctx, email);
  const open = await db.invitation.count({ where: { ...openInvitations(ctx.organizationId), NOT: { email } } });
  if (open >= INVITE_LIMITS.maxOpen) throw new AccountError(`Es sind bereits ${open} Einladungen offen. Bitte ziehen Sie nicht mehr benötigte zurück.`);
  if (
    !rateLimit(`invite-org:${ctx.organizationId}`, INVITE_LIMITS.perOrgPerHour, 3_600_000).ok ||
    !rateLimit(`invite-to:${hashToken(email)}`, INVITE_LIMITS.perRecipientPerDay, 86_400_000).ok
  ) {
    throw new AccountError("Zu viele Einladungen in kurzer Zeit. Bitte später erneut versuchen.");
  }

  const token = randomToken();
  const created = await db.invitation.create({
    data: { organizationId: ctx.organizationId, email, role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000) },
  });
  try {
    await mailInvitation(ctx, email, role, token);
  } catch (error) {
    // Nur die neue Einladung verwerfen – eine ältere, noch gültige bleibt bestehen
    await db.invitation.delete({ where: { id: created.id } }).catch(() => undefined);
    throw error;
  }
  // Erst nach erfolgreichem Versand ersetzen: ältere Links derselben Adresse werden ungültig
  await db.invitation.deleteMany({ where: { organizationId: ctx.organizationId, email, acceptedAt: null, NOT: { id: created.id } } });
}

/** Neuer Link für eine offene oder abgelaufene Einladung (alter Link wird ungültig). */
export async function resendInvitation(ctx: InviteContext, invitationId: string): Promise<string> {
  const inv = await db.invitation.findFirst({ where: { id: invitationId, organizationId: ctx.organizationId, acceptedAt: null } });
  if (!inv) throw new AccountError("Einladung nicht gefunden.");
  await inviteMember(ctx, inv.email, inv.role);
  return inv.email;
}

export async function revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
  await db.invitation.deleteMany({ where: { id: invitationId, organizationId, acceptedAt: null } });
}

async function findInvitation(token: string) {
  if (!token || token.length > 200) return null;
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { name: true, restaurants: { select: { slug: true, name: true }, orderBy: { name: "asc" }, take: 1 } } } },
  });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

export interface InvitationView {
  email: string;
  role: Role;
  restaurantName: string;
  /** Es gibt bereits ein Konto mit dieser Adresse → nur Passwort bestätigen. */
  existingAccount: boolean;
}

export async function invitationView(token: string): Promise<InvitationView | null> {
  const inv = await findInvitation(token);
  if (!inv) return null;
  const user = await db.user.findUnique({ where: { email: inv.email }, select: { disabledAt: true } });
  if (user?.disabledAt) return null;
  return {
    email: inv.email,
    role: inv.role,
    restaurantName: inv.organization.restaurants[0]?.name ?? inv.organization.name,
    existingAccount: !!user,
  };
}

/**
 * Einladung einlösen. Neues Konto: Name + Passwort. Bestehendes Konto (z. B.
 * aus einem anderen Betrieb): aktuelles Passwort zur Bestätigung.
 * Liefert User-ID und Slug für die Weiterleitung.
 */
export async function acceptInvitation(token: string, input: { name?: string; password: string }): Promise<{ userId: string; slug: string | null }> {
  const inv = await findInvitation(token);
  if (!inv) throw new AccountError("Die Einladung ist ungültig oder abgelaufen. Bitte lassen Sie sich neu einladen.");
  const existing = await db.user.findUnique({ where: { email: inv.email } });
  if (existing) {
    // Passwortprüfung → wie beim Login begrenzen
    if (!rateLimit(`invite-accept:${inv.id}`, 8, 15 * 60_000).ok) throw new AccountError("Zu viele Versuche. Bitte später erneut versuchen.");
    if (await db.membership.findUnique({ where: { userId_organizationId: { userId: existing.id, organizationId: inv.organizationId } } })) {
      throw new AccountError("Sie haben bereits Zugang zu diesem Betrieb. Bitte melden Sie sich an.");
    }
    if (existing.disabledAt || !(await verifyPassword(existing.passwordHash, input.password))) {
      throw new AccountError("Das Passwort ist nicht korrekt.");
    }
  } else if (!input.name?.trim()) {
    throw new AccountError("Bitte geben Sie Ihren Namen an.");
  }
  const passwordHash = existing ? null : await hashPassword(input.password);

  let userId: string;
  try {
    userId = await db.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new AccountError("Die Einladung wurde bereits angenommen.");
      // Tarif erneut prüfen (z. B. Wechsel auf Basic nach dem Einladen)
      const [members, restaurants] = await Promise.all([
        tx.membership.count({ where: { organizationId: inv.organizationId } }),
        tx.restaurant.findMany({ where: { organizationId: inv.organizationId }, select: { planCode: true } }),
      ]);
      const seats = Math.max(0, ...restaurants.map((r) => maxMembers(r.planCode)));
      if (members >= seats) throw new AccountError("Der Tarif des Restaurants erlaubt derzeit keine weiteren Zugänge. Bitte wenden Sie sich an das Restaurant.");
      const user =
        existing ??
        (await tx.user.create({ data: { email: inv.email, name: input.name!.trim().slice(0, 80), passwordHash: passwordHash!, emailVerified: new Date() } }));
      await tx.membership.create({ data: { userId: user.id, organizationId: inv.organizationId, role: inv.role } });
      return user.id;
    });
  } catch (error) {
    // Gleichzeitiges Annehmen (gleiche Adresse/zweite Einladung) → verständliche Meldung statt Serverfehler
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AccountError("Für diese Adresse wurde gerade schon ein Zugang angelegt. Bitte melden Sie sich an.");
    }
    throw error;
  }
  return { userId, slug: inv.organization.restaurants[0]?.slug ?? null };
}

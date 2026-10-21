import "server-only";
import { hashToken, randomToken } from "../crypto";
import { db } from "../db";
import { env } from "../env";
import { emailProvider } from "../email/provider";
import { renderMailHtml, renderMailText, type MailLayoutInput } from "../email/templates";
import { maxMembers, type PlanCode } from "../plans/features";
import { hashPassword, verifyPassword } from "./password";

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
  const token = randomToken();
  const created = await db.$transaction(async (tx) => {
    await tx.invitation.deleteMany({ where: { organizationId: ctx.organizationId, email, acceptedAt: null } });
    return tx.invitation.create({
      data: { organizationId: ctx.organizationId, email, role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000) },
    });
  });
  try {
    await mailInvitation(ctx, email, role, token);
  } catch (error) {
    await db.invitation.delete({ where: { id: created.id } }).catch(() => undefined);
    throw error;
  }
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
    if (existing.disabledAt || !(await verifyPassword(existing.passwordHash, input.password))) {
      throw new AccountError("Das Passwort ist nicht korrekt.");
    }
  } else if (!input.name?.trim()) {
    throw new AccountError("Bitte geben Sie Ihren Namen an.");
  }
  const passwordHash = existing ? null : await hashPassword(input.password);

  const userId = await db.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AccountError("Die Einladung wurde bereits angenommen.");
    const user =
      existing ??
      (await tx.user.create({ data: { email: inv.email, name: input.name!.trim().slice(0, 80), passwordHash: passwordHash!, emailVerified: new Date() } }));
    await tx.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: inv.organizationId } },
      update: {},
      create: { userId: user.id, organizationId: inv.organizationId, role: inv.role },
    });
    return user.id;
  });
  return { userId, slug: inv.organization.restaurants[0]?.slug ?? null };
}

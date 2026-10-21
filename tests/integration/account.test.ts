import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { acceptInvitation, AccountError, INVITE_LIMITS, invitationView, inviteMember, requestPasswordReset, resendInvitation, resetPassword, resetTokenEmail, revokeInvitation } from "@/server/auth/account";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { retryPendingEmails } from "@/server/email/outbox";
import { setEmailProvider, type EmailMessage } from "@/server/email/provider";
import { createRestaurant, resetDatabase } from "../support/factory";

const sent: EmailMessage[] = [];
let failNext = 0;
setEmailProvider({
  async send(message) {
    if (failNext > 0) {
      failNext--;
      throw new Error("Provider nicht erreichbar");
    }
    sent.push(message);
    return { id: `ok-${sent.length}` };
  },
});

beforeEach(async () => {
  sent.length = 0;
  failNext = 0;
  await resetDatabase();
});
afterAll(() => db.$disconnect());

const tokenFrom = (m: EmailMessage) => /token=([A-Za-z0-9_-]+)/.exec(m.text)![1];

async function owner(slug: string, planCode: "BASIC" | "PRO" = "PRO") {
  const { restaurant, org } = await createRestaurant(slug);
  await db.restaurant.update({ where: { id: restaurant.id }, data: { planCode } });
  const user = await db.user.create({
    data: { email: `inhaber@${slug}.test`, name: "Ina Haber", passwordHash: await hashPassword("altes-passwort-1"), memberships: { create: { organizationId: org.id, role: "OWNER" } } },
  });
  const ctx = { organizationId: org.id, restaurantId: restaurant.id, restaurantName: restaurant.name, planCode, invitedByName: "Ina Haber", locale: "de" as const };
  return { restaurant, org, user, ctx };
}

describe("Passwort vergessen", () => {
  it("sendet nur an bestehende Konten und setzt das Passwort einmalig zurück", async () => {
    const { user } = await owner("reset");
    await db.session.create({ data: { userId: user.id, tokenHash: "x", expiresAt: new Date(Date.now() + 86_400_000) } });

    await requestPasswordReset("unbekannt@example.test");
    expect(sent).toHaveLength(0);
    expect(await db.passwordResetToken.count()).toBe(0);

    await requestPasswordReset("  INHABER@reset.test ");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("/admin/passwort-neu?token=");
    const token = tokenFrom(sent[0]);
    // Nur der Hash liegt in der Datenbank
    expect((await db.passwordResetToken.findFirstOrThrow()).tokenHash).not.toContain(token);
    expect(await resetTokenEmail(token)).toBe("inhaber@reset.test");

    expect(await resetPassword(token, "neues-passwort-1")).toBe(user.id);
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(updated.passwordHash, "neues-passwort-1")).toBe(true);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0); // überall abgemeldet

    await expect(resetPassword(token, "drittes-passwort-1")).rejects.toBeInstanceOf(AccountError);
    expect(await resetTokenEmail(token)).toBeNull();
  });

  it("entwertet ältere Links und abgelaufene Links", async () => {
    await owner("reset2");
    await requestPasswordReset("inhaber@reset2.test");
    await requestPasswordReset("inhaber@reset2.test");
    const [first, second] = sent.map(tokenFrom);
    expect(await resetTokenEmail(first)).toBeNull();
    expect(await resetTokenEmail(second)).toBe("inhaber@reset2.test");
    await db.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(resetPassword(second, "neues-passwort-1")).rejects.toThrow(/account.err.resetInvalid/);
  });

  it("ignoriert gesperrte Konten", async () => {
    const { user } = await owner("gesperrt");
    await db.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    await requestPasswordReset("inhaber@gesperrt.test");
    expect(sent).toHaveLength(0);
  });
});

describe("Einladungen", () => {
  it("lädt ein, legt beim Annehmen Konto und Zugang an – einmalig", async () => {
    const { ctx, org } = await owner("team");
    await inviteMember(ctx, "Neu@Example.test", "STAFF");
    expect(sent[0].to).toBe("neu@example.test");
    expect(sent[0].subject).toContain("Einladung");
    const token = tokenFrom(sent[0]);

    expect(await invitationView(token)).toMatchObject({ email: "neu@example.test", role: "STAFF", existingAccount: false });
    await expect(acceptInvitation(token, { password: "passwort-neu-1" })).rejects.toThrow(/account.err.nameMissing/);
    const result = await acceptInvitation(token, { name: "Nina Neu", password: "passwort-neu-1" });
    expect(result.slug).toBe("team");
    const member = await db.membership.findFirstOrThrow({ where: { userId: result.userId } });
    expect(member).toMatchObject({ organizationId: org.id, role: "STAFF" });

    await expect(acceptInvitation(token, { name: "X", password: "passwort-neu-1" })).rejects.toBeInstanceOf(AccountError);
    expect(await invitationView(token)).toBeNull();
    await expect(inviteMember(ctx, "neu@example.test", "STAFF")).rejects.toThrow(/account.err.(alreadyMember|alreadyHasAccess)/);
  });

  it("verlangt bei bestehendem Konto das richtige Passwort", async () => {
    const a = await owner("betrieb-a");
    const b = await owner("betrieb-b");
    await inviteMember(b.ctx, a.user.email, "OWNER");
    const token = tokenFrom(sent[0]);
    expect((await invitationView(token))?.existingAccount).toBe(true);
    await expect(acceptInvitation(token, { password: "falsch-falsch" })).rejects.toThrow(/account.err.wrongPassword/);
    await acceptInvitation(token, { password: "altes-passwort-1" });
    expect(await db.membership.count({ where: { userId: a.user.id } })).toBe(2);
    // Passwort wurde nicht verändert
    expect(await verifyPassword((await db.user.findUniqueOrThrow({ where: { id: a.user.id } })).passwordHash, "altes-passwort-1")).toBe(true);
  });

  it("beachtet das Tariflimit inklusive offener Einladungen", async () => {
    const basic = await owner("basic", "BASIC");
    await expect(inviteMember(basic.ctx, "x@example.test", "STAFF")).rejects.toThrow(/account.err.basicLimit/);
    expect(sent).toHaveLength(0);
  });

  it("erneut senden entwertet den alten Link, zurückziehen entwertet alle", async () => {
    const { ctx, org } = await owner("resend");
    await inviteMember(ctx, "neu@example.test", "STAFF");
    const inv = await db.invitation.findFirstOrThrow();
    await resendInvitation(ctx, inv.id);
    const [oldToken, newToken] = sent.map(tokenFrom);
    expect(await invitationView(oldToken)).toBeNull();
    expect(await invitationView(newToken)).not.toBeNull();

    const current = await db.invitation.findFirstOrThrow();
    await revokeInvitation("fremde-org", current.id); // fremde Organisation: keine Wirkung
    expect(await invitationView(newToken)).not.toBeNull();
    await revokeInvitation(org.id, current.id);
    expect(await invitationView(newToken)).toBeNull();
  });

  it("behält beim Erneuern die alte Einladung, wenn der Versand scheitert", async () => {
    const { ctx } = await owner("erneuern");
    await inviteMember(ctx, "erneuern@example.test", "STAFF");
    const oldToken = tokenFrom(sent[0]);
    failNext = 1;
    await expect(inviteMember(ctx, "erneuern@example.test", "STAFF")).rejects.toThrow(/account.err.mailFailed/);
    expect(await invitationView(oldToken)).not.toBeNull();
    expect(await db.invitation.count()).toBe(1);
  });

  it("prüft beim Annehmen den Tarif erneut und lehnt doppelte Zugänge ab", async () => {
    const { ctx, restaurant } = await owner("downgrade");
    await inviteMember(ctx, "spaet@example.test", "STAFF");
    await db.restaurant.update({ where: { id: restaurant.id }, data: { planCode: "BASIC" } });
    await expect(acceptInvitation(tokenFrom(sent[0]), { name: "Spät", password: "passwort-neu-1" })).rejects.toThrow(/account.err.planFull/);
    expect(await db.user.count({ where: { email: "spaet@example.test" } })).toBe(0); // zurückgerollt

    const a = await owner("doppelt-a");
    const b = await owner("doppelt-b");
    await inviteMember(b.ctx, a.user.email, "STAFF");
    const token = tokenFrom(sent.at(-1)!);
    await db.membership.create({ data: { userId: a.user.id, organizationId: b.org.id, role: "OWNER" } });
    await expect(acceptInvitation(token, { password: "altes-passwort-1" })).rejects.toThrow(/account.err.(alreadyMember|alreadyHasAccess)/);
  });

  it("begrenzt Einladungen je Betrieb (kein Mail-Relais)", async () => {
    const { ctx } = await owner("relais");
    for (let i = 0; i < INVITE_LIMITS.perOrgPerHour; i++) await inviteMember(ctx, `p${i}@relais.test`, "STAFF");
    await expect(inviteMember(ctx, "zuviel@relais.test", "STAFF")).rejects.toThrow(/account.err.tooManyInvites/);
  });

  it("legt bei Versandfehler keine Einladung an und protokolliert ohne Nachversand", async () => {
    const { ctx } = await owner("fehler");
    failNext = 1;
    await expect(inviteMember(ctx, "fehler@example.test", "STAFF")).rejects.toThrow(/account.err.mailFailed/);
    expect(await db.invitation.count()).toBe(0);
    const log = await db.emailLog.findFirstOrThrow({ where: { type: "STAFF_INVITATION" } });
    expect(log).toMatchObject({ status: "FAILED", providerMessageId: "direct" });
    await retryPendingEmails();
    expect(await db.emailLog.findUniqueOrThrow({ where: { id: log.id } })).toMatchObject({ status: "FAILED" });
  });
});

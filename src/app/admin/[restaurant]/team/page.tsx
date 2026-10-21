import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateFormat } from "@/i18n/admin/format";
import { db } from "@/server/db";
import { getAdminT } from "@/server/i18n";
import { maxMembers } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { inviteMemberAction, removeMemberAction, resendInvitationAction, revokeInvitationAction } from "./actions";

export default async function TeamPage(props: PageProps<"/admin/[restaurant]/team">) {
  const { restaurant: slug } = await props.params;
  const { restaurant, user } = await requireRestaurantAccess(slug, { ownerOnly: true });
  const { t, locale } = await getAdminT();
  const members = await db.membership.findMany({
    where: { organizationId: restaurant.organizationId },
    include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  const invitations = await db.invitation.findMany({
    where: { organizationId: restaurant.organizationId, acceptedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const now = new Date();
  const openInvites = invitations.filter((i) => i.expiresAt > now).length;
  const limit = maxMembers(restaurant.planCode);
  const canAdd = members.length + openInvites < limit;
  const dt = dateFormat(locale, { dateStyle: "medium", timeZone: restaurant.timezone });

  return (
    <>
      <PageHeader
        title={t("team.title")}
        description={Number.isFinite(limit) ? t("team.limit", { count: members.length, limit }) : t("team.unlimited")}
      />
      <div className="space-y-6">
        <Section title={t("team.members")}>
          <ul className="divide-y text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="font-medium">{m.user.name ?? m.user.email}</span>
                <span className="text-muted-foreground">{m.user.email}</span>
                <Badge variant="secondary">{t(`common.role.${m.role}`)}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {m.user.lastLoginAt ? t("team.lastLogin", { date: dt.format(m.user.lastLoginAt) }) : t("team.neverLoggedIn")}
                </span>
                {m.user.id !== user.id ? (
                  <ConfirmAction
                    action={removeMemberAction.bind(null, slug, m.id)}
                    title={t("team.removeTitle", { email: m.user.email })}
                    confirmLabel={t("common.remove")}
                    destructive
                  >
                    {t("common.remove")}
                  </ConfirmAction>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>

        {invitations.length > 0 ? (
          <Section title={t("team.invitations")}>
            <ul className="divide-y text-sm">
              {invitations.map((inv) => {
                const expired = inv.expiresAt <= now;
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="font-medium">{inv.email}</span>
                    <Badge variant="secondary">{t(`common.role.${inv.role}`)}</Badge>
                    <span className={expired ? "ml-auto text-xs text-destructive" : "ml-auto text-xs text-muted-foreground"}>
                      {expired ? t("team.expiredOn", { date: dt.format(inv.expiresAt) }) : t("team.validUntil", { date: dt.format(inv.expiresAt) })}
                    </span>
                    <ConfirmAction action={resendInvitationAction.bind(null, slug, inv.id)} title={t("team.resendTitle", { email: inv.email })} description={t("team.resendDescription")} confirmLabel={t("team.send")}>
                      {t("team.resend")}
                    </ConfirmAction>
                    <ConfirmAction action={revokeInvitationAction.bind(null, slug, inv.id)} title={t("team.revokeTitle", { email: inv.email })} confirmLabel={t("team.revoke")} destructive>
                      {t("team.revoke")}
                    </ConfirmAction>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        <Section
          title={t("team.invite.title")}
          description={canAdd
              ? t("team.invite.description")
              : undefined}
        >
          {canAdd ? (
            <ActionForm action={inviteMemberAction.bind(null, slug)} resetOnSuccess className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="t-email">{t("team.invite.email")}</Label>
                <Input id="t-email" name="email" type="email" required autoComplete="off" />
                <FieldError name="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-role">{t("team.invite.role")}</Label>
                <select id="t-role" name="role" className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="STAFF">{t("common.role.STAFF")}</option>
                  <option value="OWNER">{t("common.role.OWNER")}</option>
                </select>
              </div>
              <SubmitButton>{t("team.invite.submit")}</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              {members.length < limit
                ? t("team.invite.pending")
                : t("team.invite.basic")}
            </p>
          )}
        </Section>
      </div>
    </>
  );
}

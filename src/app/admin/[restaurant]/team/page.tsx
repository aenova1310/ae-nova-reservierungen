import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/server/db";
import { maxMembers } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { addMemberAction, removeMemberAction } from "./actions";

export default async function TeamPage(props: PageProps<"/admin/[restaurant]/team">) {
  const { restaurant: slug } = await props.params;
  const { restaurant, user } = await requireRestaurantAccess(slug, { ownerOnly: true });
  const members = await db.membership.findMany({
    where: { organizationId: restaurant.organizationId },
    include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  const limit = maxMembers(restaurant.planCode);
  const canAdd = members.length < limit;
  const dt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: restaurant.timezone });

  return (
    <>
      <PageHeader
        title="Team"
        description={Number.isFinite(limit) ? `${members.length} von ${limit} Zugang im Basic-Tarif` : "Unbegrenzte Mitarbeiter-Zugänge (Pro)"}
      />
      <div className="space-y-6">
        <Section title="Zugänge">
          <ul className="divide-y text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="font-medium">{m.user.name ?? m.user.email}</span>
                <span className="text-muted-foreground">{m.user.email}</span>
                <Badge variant="secondary">{m.role === "OWNER" ? "Inhaber/in" : "Mitarbeiter/in"}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  {m.user.lastLoginAt ? `Zuletzt angemeldet ${dt.format(m.user.lastLoginAt)}` : "Noch nicht angemeldet"}
                </span>
                {m.user.id !== user.id ? (
                  <ConfirmAction
                    action={removeMemberAction.bind(null, slug, m.id)}
                    title={`Zugang für ${m.user.email} entfernen?`}
                    confirmLabel="Entfernen"
                    destructive
                  >
                    Entfernen
                  </ConfirmAction>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Zugang hinzufügen"
          description={canAdd ? "Mitarbeiter sehen Reservierungen, Tagesplan, Tische und Öffnungszeiten – keine Einstellungen, kein Team, keinen Datenschutz-Bereich." : undefined}
        >
          {canAdd ? (
            <ActionForm action={addMemberAction.bind(null, slug)} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="t-name">Name</Label>
                <Input id="t-name" name="name" required />
                <FieldError name="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-email">E-Mail</Label>
                <Input id="t-email" name="email" type="email" required autoComplete="off" />
                <FieldError name="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-pass">Startpasswort</Label>
                <Input id="t-pass" name="password" type="text" required minLength={10} autoComplete="new-password" />
                <FieldError name="password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-role">Rolle</Label>
                <select id="t-role" name="role" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="STAFF">Mitarbeiter/in</option>
                  <option value="OWNER">Inhaber/in</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <SubmitButton>Zugang anlegen</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">
              Im Basic-Tarif ist ein Admin-Zugang enthalten. Mit Pro erhalten Sie unbegrenzte Mitarbeiter-Zugänge.
            </p>
          )}
        </Section>
      </div>
    </>
  );
}

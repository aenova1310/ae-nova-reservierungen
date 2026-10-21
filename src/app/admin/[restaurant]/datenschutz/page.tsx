import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { PageHeader, Section } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateFormat } from "@/i18n/admin/format";
import { db } from "@/server/db";
import { getAdminT } from "@/server/i18n";
import { findGuestReservations } from "@/server/privacy/anonymize";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { eraseGuestAction } from "./actions";

export default async function PrivacyPage(props: PageProps<"/admin/[restaurant]/datenschutz">) {
  const { restaurant: slug } = await props.params;
  const sp = await props.searchParams;
  const { restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
  const { t, locale } = await getAdminT();
  const email = typeof sp.email === "string" ? sp.email.trim().toLowerCase().slice(0, 254) : "";
  const [rows, settings, requests] = await Promise.all([
    email ? findGuestReservations(restaurant.id, email) : Promise.resolve([]),
    db.restaurantSettings.findUnique({ where: { restaurantId: restaurant.id } }),
    db.privacyRequest.findMany({ where: { restaurantId: restaurant.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const dt = dateFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: restaurant.timezone });

  return (
    <>
      <PageHeader
        title={t("privacy.title")}
        description={t("privacy.description", { days: settings?.anonymizeAfterDays ?? 180 })}
      />
      <div className="space-y-6">
        <Section title={t("privacy.request.title")} description={t("privacy.request.description")}>
          <form method="get" className="flex flex-wrap items-end gap-2" role="search">
            <div className="space-y-1.5">
              <Label htmlFor="p-email">{t("privacy.guestEmail")}</Label>
              <Input id="p-email" name="email" type="email" defaultValue={email} required className="w-72" />
            </div>
            <Button type="submit" variant="secondary">{t("privacy.search")}</Button>
          </form>

          {email ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm">
                {rows.length === 0 ? t("privacy.noData") : t("privacy.found", { count: rows.length })}
              </p>
              {rows.length ? (
                <>
                  <ul className="divide-y rounded-md border text-sm">
                    {rows.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                        <span className="tabular w-44">{dt.format(r.startsAt)}</span>
                        <span>{r.guestName}</span>
                        <span className="text-muted-foreground">{t("privacy.guestsShort", { count: r.partySize })} · {r.code}</span>
                        <StatusBadge status={r.status} className="ml-auto" />
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-6">
                    <Button asChild variant="outline">
                      <a href={`/admin/${slug}/datenschutz/export?email=${encodeURIComponent(email)}`}>{t("privacy.download")}</a>
                    </Button>
                    <ActionForm action={eraseGuestAction.bind(null, slug)} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="email" value={email} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="confirm" required /> {t("privacy.confirmErase")}
                      </label>
                      <SubmitButton variant="destructive">{t("privacy.erase")}</SubmitButton>
                      <FieldError name="email" />
                    </ActionForm>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("privacy.upcomingHint")}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section title={t("privacy.log.title")} description={t("privacy.log.description")}>
          {requests.length ? (
            <ul className="space-y-1 text-sm">
              {requests.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <span className="tabular w-44 text-muted-foreground">{dt.format(r.createdAt)}</span>
                  <span>{r.type === "EXPORT" ? t("privacy.log.export") : t("privacy.log.erase")} · {t("privacy.log.records", { count: r.affectedCount })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("privacy.log.empty")}</p>
          )}
        </Section>
      </div>
    </>
  );
}

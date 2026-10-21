import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { LogoSettings } from "@/components/admin/logo-settings";
import { logoView } from "@/server/media/service";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getTranslator } from "@/i18n/messages";
import { WIDGET_FONTS, type WidgetFontKey } from "@/lib/fonts";
import { db } from "@/server/db";
import { getAdminT } from "@/server/i18n";
import { hasFeature } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { REMINDER_HOURS_OPTIONS } from "@/server/email/reminders";
import { saveBookingRulesAction, saveBrandingAction, saveContactAction, savePrivacyAction, saveReminderAction } from "./actions";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default async function SettingsPage(props: PageProps<"/admin/[restaurant]/einstellungen">) {
  const { restaurant: slug } = await props.params;
  const { restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
  const full = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id }, include: { settings: true, branding: true } });
  const { t } = await getAdminT();
  const s = full.settings!;
  const b = full.branding;
  // Platzhalter = Standardtext für Gäste in der Sprache des jeweiligen Feldes (nicht der Admin-Sprache)
  const privacyVars = { restaurant: full.name, days: s.anonymizeAfterDays };
  const defaultPrivacyDe = getTranslator("de")("privacy.default", privacyVars);
  const defaultPrivacyEn = getTranslator("en")("privacy.default", privacyVars);

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.desc")} />
      <div className="space-y-6">
        <Section title={t("settings.rules")}>
          <ActionForm action={saveBookingRulesAction.bind(null, slug)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("settings.allocation")} htmlFor="allocationMode" hint={t("settings.allocationHint")}>
              <select id="allocationMode" name="allocationMode" defaultValue={s.allocationMode} className={selectClass}>
                <option value="AUTOMATIC">{t("settings.allocation.AUTOMATIC")}</option>
                <option value="GUEST_CHOOSES_TABLE">{t("settings.allocation.GUEST_CHOOSES_TABLE")}</option>
              </select>
            </Field>
            <Field label={t("settings.confirmation")} htmlFor="confirmationMode" hint={t("settings.confirmationHint")}>
              <select id="confirmationMode" name="confirmationMode" defaultValue={s.confirmationMode} className={selectClass}>
                <option value="AUTOMATIC">{t("settings.confirmation.AUTOMATIC")}</option>
                <option value="MANUAL">{t("settings.confirmation.MANUAL")}</option>
              </select>
            </Field>
            <Field label={t("settings.quota")} htmlFor="onlineQuotaPercent" hint={t("settings.quotaHint")}>
              <Input id="onlineQuotaPercent" name="onlineQuotaPercent" type="number" min={0} max={100} defaultValue={s.onlineQuotaPercent} />
            </Field>
            <Field label={t("settings.slotInterval")} htmlFor="slotIntervalMinutes">
              <Input id="slotIntervalMinutes" name="slotIntervalMinutes" type="number" min={5} step={5} defaultValue={s.slotIntervalMinutes} />
            </Field>
            <Field label={t("settings.buffer")} htmlFor="bufferMinutes" hint={t("settings.bufferHint")}>
              <Input id="bufferMinutes" name="bufferMinutes" type="number" min={0} step={5} defaultValue={s.bufferMinutes} />
            </Field>
            <Field label={t("settings.leadTime")} htmlFor="minLeadTimeMinutes" hint={t("settings.leadTimeHint")}>
              <Input id="minLeadTimeMinutes" name="minLeadTimeMinutes" type="number" min={0} step={15} defaultValue={s.minLeadTimeMinutes} />
            </Field>
            <Field label={t("settings.maxAdvance")} htmlFor="maxAdvanceDays">
              <Input id="maxAdvanceDays" name="maxAdvanceDays" type="number" min={1} defaultValue={s.maxAdvanceDays} />
            </Field>
            <Field label={t("settings.minParty")} htmlFor="minPartySize">
              <Input id="minPartySize" name="minPartySize" type="number" min={1} defaultValue={s.minPartySize} />
            </Field>
            <Field label={t("settings.maxParty")} htmlFor="maxPartySizeOnline" hint={t("settings.maxPartyHint")} error="maxPartySizeOnline">
              <Input id="maxPartySizeOnline" name="maxPartySizeOnline" type="number" min={1} defaultValue={s.maxPartySizeOnline} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>{t("settings.saveRules")}</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section title={t("settings.reminder")} description={t("settings.reminderDesc")}>
          <ActionForm action={saveReminderAction.bind(null, slug)} className="flex flex-wrap items-end gap-4">
            <Field label={t("settings.reminderSend")} htmlFor="reminder" hint={t("settings.reminderHint")}>
              <select id="reminder" name="reminder" defaultValue={s.reminderEnabled ? String(s.reminderHoursBefore) : "off"} className={selectClass}>
                <option value="off">{t("settings.reminderOff")}</option>
                {REMINDER_HOURS_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {t("settings.reminderHours", { count: h })}
                  </option>
                ))}
              </select>
            </Field>
            <SubmitButton>{t("common.save")}</SubmitButton>
          </ActionForm>
        </Section>

        <Section title={t("settings.logo")} description={t("settings.logoDesc")}>
          <LogoSettings
            slug={slug}
            restaurantName={full.name}
            logo={logoView(b)}
          />
        </Section>

        <Section
          title={t("settings.branding")}
          description={hasFeature(full.planCode, "removePoweredBy") ? t("settings.brandingPro") : t("settings.brandingBasic")}
        >
          <ActionForm action={saveBrandingAction.bind(null, slug)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("settings.primaryColor")} htmlFor="primaryColor" error="primaryColor">
              <div className="flex gap-2">
                <input type="color" aria-label={t("settings.pickColor")} defaultValue={b?.primaryColor ?? "#6B1E2E"} className="h-9 w-12 cursor-pointer rounded-md border" name="primaryColor" />
              </div>
            </Field>
            <Field label={t("settings.headingFont")} htmlFor="fontFamily">
              <select id="fontFamily" name="fontFamily" defaultValue={b?.fontFamily ?? "serif-classic"} className={selectClass}>
                {(Object.keys(WIDGET_FONTS) as WidgetFontKey[]).map((key) => (
                  <option key={key} value={key}>{t(`settings.font.${key}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("settings.themeMode")} htmlFor="themeMode">
              <select id="themeMode" name="themeMode" defaultValue={b?.themeMode ?? "LIGHT"} className={selectClass}>
                <option value="LIGHT">{t("settings.theme.LIGHT")}</option>
                <option value="DARK">{t("settings.theme.DARK")}</option>
              </select>
            </Field>
            <Field label={t("settings.corners")} htmlFor="cornerStyle">
              <select id="cornerStyle" name="cornerStyle" defaultValue={b?.cornerStyle ?? "soft"} className={selectClass}>
                <option value="sharp">{t("settings.corner.sharp")}</option>
                <option value="soft">{t("settings.corner.soft")}</option>
                <option value="round">{t("settings.corner.round")}</option>
              </select>
            </Field>
            <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">{t("settings.previewHint")}</p>
            <div className="sm:col-span-2 lg:col-span-4">
              <SubmitButton>{t("settings.saveBranding")}</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section title={t("settings.privacy")} description={t("settings.privacyDesc")}>
          <ActionForm action={savePrivacyAction.bind(null, slug)} className="space-y-4">
            <Field label={t("settings.privacyDe")} htmlFor="privacyNoticeDe">
              <Textarea id="privacyNoticeDe" name="privacyNoticeDe" rows={5} defaultValue={s.privacyNoticeDe ?? ""} placeholder={defaultPrivacyDe} />
            </Field>
            <Field label={t("settings.privacyEn")} htmlFor="privacyNoticeEn">
              <Textarea id="privacyNoticeEn" name="privacyNoticeEn" rows={4} defaultValue={s.privacyNoticeEn ?? ""} placeholder={defaultPrivacyEn} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.policyUrl")} htmlFor="privacyPolicyUrl" error="privacyPolicyUrl">
                <Input id="privacyPolicyUrl" name="privacyPolicyUrl" type="url" placeholder="https://…" defaultValue={s.privacyPolicyUrl ?? ""} />
              </Field>
              <Field label={t("settings.anonymize")} htmlFor="anonymizeAfterDays" hint={t("settings.anonymizeHint")} error="anonymizeAfterDays">
                <Input id="anonymizeAfterDays" name="anonymizeAfterDays" type="number" min={30} max={180} defaultValue={s.anonymizeAfterDays} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.privacyVersion", { version: s.privacyNoticeVersion })}</p>
            <SubmitButton>{t("settings.savePrivacy")}</SubmitButton>
          </ActionForm>
        </Section>

        <Section title={t("settings.contact")} description={t("settings.contactDesc")}>
          <ActionForm action={saveContactAction.bind(null, slug)} className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.c.name")} htmlFor="c-name"><Input id="c-name" name="name" defaultValue={full.name} required /></Field>
            <Field label={t("settings.c.email")} htmlFor="c-email" error="email"><Input id="c-email" name="email" type="email" defaultValue={full.email} required /></Field>
            <Field label={t("settings.c.phone")} htmlFor="c-phone"><Input id="c-phone" name="phone" defaultValue={full.phone ?? ""} /></Field>
            <Field label={t("settings.c.website")} htmlFor="c-web" error="websiteUrl"><Input id="c-web" name="websiteUrl" type="url" defaultValue={full.websiteUrl ?? ""} /></Field>
            <Field label={t("settings.c.street")} htmlFor="c-street"><Input id="c-street" name="street" defaultValue={full.street ?? ""} /></Field>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Field label={t("settings.c.zip")} htmlFor="c-zip"><Input id="c-zip" name="postalCode" defaultValue={full.postalCode ?? ""} /></Field>
              <Field label={t("settings.c.city")} htmlFor="c-city"><Input id="c-city" name="city" defaultValue={full.city ?? ""} /></Field>
            </div>
            <div className="sm:col-span-2"><SubmitButton>{t("settings.saveContact")}</SubmitButton></div>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <FieldError name={error} /> : null}
    </div>
  );
}

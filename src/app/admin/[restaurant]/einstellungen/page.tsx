import { ActionForm, FieldError, SubmitButton } from "@/components/admin/action-form";
import { PageHeader, Section } from "@/components/admin/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getTranslator } from "@/i18n/messages";
import { WIDGET_FONTS } from "@/lib/fonts";
import { db } from "@/server/db";
import { hasFeature } from "@/server/plans/features";
import { requireRestaurantAccess } from "@/server/tenancy/access";
import { saveBookingRulesAction, saveBrandingAction, saveContactAction, savePrivacyAction } from "./actions";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default async function SettingsPage(props: PageProps<"/admin/[restaurant]/einstellungen">) {
  const { restaurant: slug } = await props.params;
  const { restaurant } = await requireRestaurantAccess(slug, { ownerOnly: true });
  const full = await db.restaurant.findUniqueOrThrow({ where: { id: restaurant.id }, include: { settings: true, branding: true } });
  const s = full.settings!;
  const b = full.branding;
  const defaultPrivacy = getTranslator("de")("privacy.default", { restaurant: full.name, days: s.anonymizeAfterDays });

  return (
    <>
      <PageHeader title="Einstellungen" description="Gelten sofort für das Online-Widget." />
      <div className="space-y-6">
        <Section title="Buchungsregeln">
          <ActionForm action={saveBookingRulesAction.bind(null, slug)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tischvergabe" htmlFor="allocationMode" hint="Bei „Gast wählt“ sieht der Gast freie Tische je Bereich.">
              <select id="allocationMode" name="allocationMode" defaultValue={s.allocationMode} className={selectClass}>
                <option value="AUTOMATIC">Automatisch (Gast wählt höchstens den Bereich)</option>
                <option value="GUEST_CHOOSES_TABLE">Gast wählt Bereich und Tisch</option>
              </select>
            </Field>
            <Field label="Bestätigung" htmlFor="confirmationMode" hint="Bei manueller Freigabe bleibt der Tisch bis zur Entscheidung blockiert.">
              <select id="confirmationMode" name="confirmationMode" defaultValue={s.confirmationMode} className={selectClass}>
                <option value="AUTOMATIC">Automatisch bestätigen</option>
                <option value="MANUAL">Manuell freigeben</option>
              </select>
            </Field>
            <Field label="Online-Kontingent (%)" htmlFor="onlineQuotaPercent" hint="Anteil der Plätze, der gleichzeitig online belegt sein darf.">
              <Input id="onlineQuotaPercent" name="onlineQuotaPercent" type="number" min={0} max={100} defaultValue={s.onlineQuotaPercent} />
            </Field>
            <Field label="Slot-Raster (Minuten)" htmlFor="slotIntervalMinutes">
              <Input id="slotIntervalMinutes" name="slotIntervalMinutes" type="number" min={5} step={5} defaultValue={s.slotIntervalMinutes} />
            </Field>
            <Field label="Puffer nach jeder Buchung (Minuten)" htmlFor="bufferMinutes" hint="Zeit zum Abräumen und Eindecken.">
              <Input id="bufferMinutes" name="bufferMinutes" type="number" min={0} step={5} defaultValue={s.bufferMinutes} />
            </Field>
            <Field label="Vorlaufzeit (Minuten)" htmlFor="minLeadTimeMinutes" hint="So kurzfristig darf online gebucht werden.">
              <Input id="minLeadTimeMinutes" name="minLeadTimeMinutes" type="number" min={0} step={15} defaultValue={s.minLeadTimeMinutes} />
            </Field>
            <Field label="Max. Tage im Voraus" htmlFor="maxAdvanceDays">
              <Input id="maxAdvanceDays" name="maxAdvanceDays" type="number" min={1} defaultValue={s.maxAdvanceDays} />
            </Field>
            <Field label="Mindestgröße online" htmlFor="minPartySize">
              <Input id="minPartySize" name="minPartySize" type="number" min={1} defaultValue={s.minPartySize} />
            </Field>
            <Field label="Höchstgröße online" htmlFor="maxPartySizeOnline" hint="Größere Gruppen sehen Ihre Telefonnummer." error="maxPartySizeOnline">
              <Input id="maxPartySizeOnline" name="maxPartySizeOnline" type="number" min={1} defaultValue={s.maxPartySizeOnline} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton>Buchungsregeln speichern</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section
          title="Erscheinungsbild des Widgets"
          description={hasFeature(full.planCode, "removePoweredBy") ? "Pro: ohne „powered by“-Hinweis." : "Im Basic-Tarif steht ein dezenter „powered by“-Hinweis im Widget."}
        >
          <ActionForm action={saveBrandingAction.bind(null, slug)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Primärfarbe" htmlFor="primaryColor" error="primaryColor">
              <div className="flex gap-2">
                <input type="color" aria-label="Farbe wählen" defaultValue={b?.primaryColor ?? "#6B1E2E"} className="h-9 w-12 cursor-pointer rounded-md border" name="primaryColor" />
              </div>
            </Field>
            <Field label="Schrift für Überschriften" htmlFor="fontFamily">
              <select id="fontFamily" name="fontFamily" defaultValue={b?.fontFamily ?? "serif-classic"} className={selectClass}>
                {Object.entries(WIDGET_FONTS).map(([key, f]) => (
                  <option key={key} value={key}>{f.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Modus" htmlFor="themeMode">
              <select id="themeMode" name="themeMode" defaultValue={b?.themeMode ?? "LIGHT"} className={selectClass}>
                <option value="LIGHT">Hell</option>
                <option value="DARK">Dunkel</option>
              </select>
            </Field>
            <Field label="Ecken" htmlFor="cornerStyle">
              <select id="cornerStyle" name="cornerStyle" defaultValue={b?.cornerStyle ?? "soft"} className={selectClass}>
                <option value="sharp">Kantig</option>
                <option value="soft">Leicht gerundet</option>
                <option value="round">Rund</option>
              </select>
            </Field>
            <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
              Logo-Upload folgt mit dem Medien-Speicher in Phase 2. Vorschau unter „Website-Einbindung“.
            </p>
            <div className="sm:col-span-2 lg:col-span-4">
              <SubmitButton>Erscheinungsbild speichern</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section title="Datenschutzhinweis im Widget" description="Leer lassen, um den Standardtext zu verwenden. Jede Änderung erzeugt eine neue Version, die bei Buchungen mitgespeichert wird.">
          <ActionForm action={savePrivacyAction.bind(null, slug)} className="space-y-4">
            <Field label="Text (Deutsch)" htmlFor="privacyNoticeDe">
              <Textarea id="privacyNoticeDe" name="privacyNoticeDe" rows={5} defaultValue={s.privacyNoticeDe ?? ""} placeholder={defaultPrivacy} />
            </Field>
            <Field label="Text (Englisch)" htmlFor="privacyNoticeEn">
              <Textarea id="privacyNoticeEn" name="privacyNoticeEn" rows={4} defaultValue={s.privacyNoticeEn ?? ""} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Link zur vollständigen Datenschutzerklärung" htmlFor="privacyPolicyUrl" error="privacyPolicyUrl">
                <Input id="privacyPolicyUrl" name="privacyPolicyUrl" type="url" placeholder="https://…" defaultValue={s.privacyPolicyUrl ?? ""} />
              </Field>
              <Field label="Gastdaten anonymisieren nach (Tagen)" htmlFor="anonymizeAfterDays" hint="Höchstens 180 Tage nach dem Reservierungsdatum." error="anonymizeAfterDays">
                <Input id="anonymizeAfterDays" name="anonymizeAfterDays" type="number" min={30} max={180} defaultValue={s.anonymizeAfterDays} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Aktuelle Version: {s.privacyNoticeVersion}</p>
            <SubmitButton>Datenschutz speichern</SubmitButton>
          </ActionForm>
        </Section>

        <Section title="Restaurant & Kontakt" description="Erscheint in E-Mails und Kalendereinträgen. Benachrichtigungen gehen an die E-Mail-Adresse.">
          <ActionForm action={saveContactAction.bind(null, slug)} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="c-name"><Input id="c-name" name="name" defaultValue={full.name} required /></Field>
            <Field label="E-Mail für Benachrichtigungen" htmlFor="c-email" error="email"><Input id="c-email" name="email" type="email" defaultValue={full.email} required /></Field>
            <Field label="Telefon" htmlFor="c-phone"><Input id="c-phone" name="phone" defaultValue={full.phone ?? ""} /></Field>
            <Field label="Website" htmlFor="c-web" error="websiteUrl"><Input id="c-web" name="websiteUrl" type="url" defaultValue={full.websiteUrl ?? ""} /></Field>
            <Field label="Straße" htmlFor="c-street"><Input id="c-street" name="street" defaultValue={full.street ?? ""} /></Field>
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <Field label="PLZ" htmlFor="c-zip"><Input id="c-zip" name="postalCode" defaultValue={full.postalCode ?? ""} /></Field>
              <Field label="Ort" htmlFor="c-city"><Input id="c-city" name="city" defaultValue={full.city ?? ""} /></Field>
            </div>
            <div className="sm:col-span-2"><SubmitButton>Kontaktdaten speichern</SubmitButton></div>
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

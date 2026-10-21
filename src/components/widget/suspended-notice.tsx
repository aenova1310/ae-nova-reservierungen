import { getTranslator, type Locale } from "@/i18n/messages";

export function SuspendedNotice({ name, phone, locale }: { name: string; phone: string | null; locale: Locale }) {
  const t = getTranslator(locale);
  return (
    <div className="mx-auto max-w-[30rem] px-5 py-12">
      <p className="font-display text-2xl">{name}</p>
      <p className="mt-4 text-muted-foreground">{t("widget.suspended")}</p>
      {phone ? (
        <a href={`tel:${phone.replace(/\s/g, "")}`} className="mt-4 inline-block underline underline-offset-4">
          {phone}
        </a>
      ) : null}
    </div>
  );
}

import { formatDateLong, formatTime, getTranslator, type Locale } from "@/i18n/messages";

/**
 * Die Bestätigung als Platzkarte – das eine prägende Element des Widgets
 * (siehe Design-System in docs/ARCHITEKTUR.md).
 */
export function PlaceCard({
  locale,
  timeZone,
  restaurantName,
  guestName,
  startsAt,
  partySize,
  tableNames,
  code,
  pending,
}: {
  locale: Locale;
  timeZone: string;
  restaurantName: string;
  guestName: string;
  startsAt: Date;
  partySize: number;
  tableNames: string[];
  code: string;
  pending?: boolean;
}) {
  const t = getTranslator(locale);
  return (
    <figure
      className="relative mx-auto w-full max-w-sm rounded-[calc(var(--radius)*1.5)] border bg-card px-7 pt-8 pb-7 text-center text-card-foreground shadow-[0_1px_0_0_var(--border)]"
      aria-label={`${t("widget.done.code")} ${code}`}
    >
      <p className="font-display text-sm tracking-wide text-primary">{restaurantName}</p>
      <div className="mx-auto mt-3 mb-5 flex w-16 flex-col gap-[3px]" aria-hidden>
        <span className="h-px bg-messing" />
        <span className="h-px bg-messing/60" />
      </div>
      <p className="font-display text-[1.75rem] leading-tight">{guestName}</p>
      <p className="mt-4 text-sm text-muted-foreground">{formatDateLong(startsAt, locale, timeZone)}</p>
      <p className="tabular mt-1 font-display text-4xl">{formatTime(startsAt, locale, timeZone)}</p>
      <dl className="mt-6 grid grid-cols-3 gap-2 border-t pt-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">{t("mail.details.party")}</dt>
          <dd className="tabular mt-0.5">{partySize}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("widget.done.table")}</dt>
          <dd className="mt-0.5">{tableNames.length ? tableNames.join(" + ") : "–"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("widget.done.code")}</dt>
          <dd className="tabular mt-0.5 font-medium tracking-wider">{code}</dd>
        </div>
      </dl>
      {pending ? (
        <figcaption className="mt-5 rounded-sm bg-messing/10 px-3 py-2 text-sm text-foreground">
          {t("manage.status.REQUESTED")}
        </figcaption>
      ) : null}
    </figure>
  );
}

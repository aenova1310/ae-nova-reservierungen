import type { Metadata } from "next";
import { PlaceCard } from "@/components/widget/place-card";
import { WidgetTheme } from "@/components/widget/widget-theme";
import { getTranslator, toLocale } from "@/i18n/messages";
import { utcToLocalDate, utcToLocalTime } from "@/server/availability/time";
import { getPublicRestaurant } from "@/server/public/widget";
import { findReservationByToken, guestCanCancel } from "@/server/reservations/manage";
import { ManageActions } from "./manage-actions";

export const metadata: Metadata = { title: "Ihre Reservierung", robots: { index: false, follow: false } };

/** Verwaltungsseite für Gäste – erreichbar nur über den Link aus der E-Mail (Token). */
export default async function ManageReservationPage(props: PageProps<"/r/[slug]/m/[token]">) {
  const { slug, token } = await props.params;
  const { lang } = await props.searchParams;
  const [reservation, restaurant] = await Promise.all([findReservationByToken(token), getPublicRestaurant(slug)]);
  const locale = toLocale(typeof lang === "string" ? lang : (reservation?.locale ?? "de"));
  const t = getTranslator(locale);

  if (!restaurant || !reservation || reservation.restaurant.slug !== slug || reservation.anonymizedAt) {
    return (
      <main className="mx-auto max-w-[30rem] px-5 py-16" lang={locale}>
        <h1 className="font-display text-2xl">{t("manage.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("manage.notFound")}</p>
      </main>
    );
  }

  const tz = reservation.restaurant.timezone;
  const open = guestCanCancel(reservation);
  const isPast = reservation.startsAt <= new Date();

  return (
    <WidgetTheme branding={restaurant.branding} className="min-h-dvh">
      <main className="mx-auto w-full max-w-[30rem] px-5 py-10" lang={locale}>
        <h1 className="font-display text-2xl">{t("manage.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(`manage.status.${reservation.status}` as Parameters<typeof t>[0])}
        </p>

        <div className={reservation.status === "CANCELLED" ? "mt-6 opacity-60" : "mt-6"}>
          <PlaceCard
            locale={locale}
            timeZone={tz}
            restaurantName={reservation.restaurant.name}
            guestName={reservation.guestName ?? ""}
            startsAt={reservation.startsAt}
            partySize={reservation.partySize}
            tableNames={reservation.tables.map((x) => x.table.name)}
            code={reservation.code}
            pending={reservation.status === "REQUESTED"}
          />
        </div>

        {open ? (
          <ManageActions
            token={token}
            slug={slug}
            locale={locale}
            current={{
              date: utcToLocalDate(reservation.startsAt, tz),
              time: utcToLocalTime(reservation.startsAt, tz),
              partySize: reservation.partySize,
            }}
            maxPartySize={restaurant.maxPartySizeOnline}
            today={restaurant.today}
            canModify={!reservation.payment}
          />
        ) : isPast && reservation.status !== "CANCELLED" ? (
          <p className="mt-8 text-sm text-muted-foreground">{t("manage.past")}</p>
        ) : null}

        {reservation.status !== "CANCELLED" && !isPast ? (
          <p className="mt-6 text-center">
            <a href={`/api/public/manage/${token}/ics`} className="text-sm underline underline-offset-4">
              {t("manage.calendar")}
            </a>
          </p>
        ) : null}

        {reservation.restaurant.phone ? (
          <p className="mt-10 text-sm text-muted-foreground">
            {t("manage.contact", { restaurant: reservation.restaurant.name, phone: reservation.restaurant.phone })}
          </p>
        ) : null}
      </main>
    </WidgetTheme>
  );
}

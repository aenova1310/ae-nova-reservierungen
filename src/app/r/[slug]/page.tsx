import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingWidget } from "@/components/widget/booking-widget";
import { SuspendedNotice } from "@/components/widget/suspended-notice";
import { WidgetTheme } from "@/components/widget/widget-theme";
import { toLocale } from "@/i18n/messages";
import { getPublicRestaurant } from "@/server/public/widget";

export async function generateMetadata(props: PageProps<"/r/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const restaurant = await getPublicRestaurant(slug);
  return { title: restaurant ? `Tisch reservieren – ${restaurant.name}` : "Reservierung" };
}

/** Gäste-Widget als eigene Seite (z. B. für Links aus Google oder Social Media). */
export default async function RestaurantBookingPage(props: PageProps<"/r/[slug]">) {
  const { slug } = await props.params;
  const { lang } = await props.searchParams;
  const restaurant = await getPublicRestaurant(slug);
  if (!restaurant) notFound();
  const locale = toLocale(typeof lang === "string" ? lang : undefined);

  return (
    <WidgetTheme branding={restaurant.branding} className="min-h-dvh">
      <main lang={locale}>
        {restaurant.suspended ? (
          <SuspendedNotice name={restaurant.name} phone={restaurant.phone} locale={locale} />
        ) : (
          <BookingWidget restaurant={restaurant} initialLocale={locale} />
        )}
      </main>
    </WidgetTheme>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoHeight } from "@/components/widget/auto-height";
import { BookingWidget } from "@/components/widget/booking-widget";
import { SuspendedNotice } from "@/components/widget/suspended-notice";
import { WidgetTheme } from "@/components/widget/widget-theme";
import { toLocale } from "@/i18n/messages";
import { getPublicRestaurant } from "@/server/public/widget";

export const metadata: Metadata = { robots: { index: false } };

/**
 * Widget ohne Seitenrahmen für die Einbettung per iframe (auch von embed.js genutzt).
 * Darf als einzige Route in fremde Seiten eingebettet werden (siehe next.config.ts).
 */
export default async function EmbedPage(props: PageProps<"/embed/[slug]">) {
  const { slug } = await props.params;
  const { lang } = await props.searchParams;
  const restaurant = await getPublicRestaurant(slug);
  if (!restaurant) notFound();
  const locale = toLocale(typeof lang === "string" ? lang : undefined);

  return (
    <WidgetTheme branding={restaurant.branding}>
      <main lang={locale}>
        {restaurant.suspended ? (
          <SuspendedNotice name={restaurant.name} phone={restaurant.phone} locale={locale} />
        ) : (
          <BookingWidget restaurant={restaurant} initialLocale={locale} embedded />
        )}
      </main>
      <AutoHeight slug={restaurant.slug} />
    </WidgetTheme>
  );
}

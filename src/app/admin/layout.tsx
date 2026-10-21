import { AdminI18nProvider } from "@/components/admin/i18n-provider";
import { ADMIN_MESSAGES } from "@/i18n/admin";
import { getAdminLocale } from "@/server/i18n";

/** Gilt für alle Seiten unter /admin – auch Anmeldung, Passwort und Einladung. */
export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  const locale = await getAdminLocale();
  return (
    <AdminI18nProvider locale={locale} messages={ADMIN_MESSAGES[locale]}>
      <div lang={locale} className="contents">
        {children}
      </div>
    </AdminI18nProvider>
  );
}

import "server-only";
import { db, type Tx } from "../db";
import { env } from "../env";
import { formatDateLong, formatTime, getTranslator, toLocale, type MessageKey } from "@/i18n/messages";
import { manageTokenFor, manageUrl } from "../reservations/tokens";
import { buildIcs } from "./ics";
import { emailProvider, type EmailMessage } from "./provider";
import { renderMailHtml, renderMailText, type MailLayoutInput } from "./templates";

export type EmailType =
  | "RESERVATION_CONFIRMED"
  | "RESERVATION_MODIFIED"
  | "RESERVATION_REQUESTED"
  | "RESERVATION_DECLINED"
  | "RESERVATION_CANCELLED_GUEST"
  | "RESERVATION_CANCELLED_RESTAURANT"
  | "RESERVATION_REMINDER"
  | "RESTAURANT_NEW_RESERVATION"
  | "RESTAURANT_RESERVATION_MODIFIED"
  | "RESTAURANT_CANCELLATION"
  | "PAYMENT_REFUNDED"
  | "STAFF_INVITATION"
  | "PASSWORD_RESET";

/**
 * Outbox-Muster: Die Mail wird in derselben Transaktion wie die Buchung als
 * QUEUED vorgemerkt und direkt nach dem Commit versendet (`dispatchEmails`).
 * Schlägt der Versand fehl, holt der Cron-Job `send-emails` sie nach.
 * Inhalt und Empfänger werden erst beim Versand aus der Reservierung gebaut –
 * die Tabelle enthält also keine Gastdaten.
 */
export async function enqueueEmail(
  tx: Tx,
  params: { restaurantId: string; reservationId: string; type: EmailType },
): Promise<string> {
  const log = await tx.emailLog.create({
    data: { restaurantId: params.restaurantId, reservationId: params.reservationId, type: params.type },
    select: { id: true },
  });
  return log.id;
}

interface GuestTemplate {
  subject: MessageKey;
  intro: MessageKey;
  withManage: boolean;
  cancelled?: boolean;
  /** Zusätzlicher Absatz nach der Einleitung. */
  extra?: MessageKey;
  /** Kalenderdatei anhängen (Standard: ja, außer bei Ablehnung). */
  ics?: boolean;
}

const GUEST_TEMPLATES: Partial<Record<EmailType, GuestTemplate>> = {
  RESERVATION_CONFIRMED: { subject: "mail.confirmed.subject", intro: "mail.confirmed.intro", withManage: true },
  RESERVATION_MODIFIED: { subject: "mail.modified.subject", intro: "mail.modified.intro", withManage: true },
  RESERVATION_REQUESTED: { subject: "mail.requested.subject", intro: "mail.requested.intro", withManage: true },
  RESERVATION_DECLINED: { subject: "mail.declined.subject", intro: "mail.declined.intro", withManage: false, cancelled: true, ics: false },
  // Der Termin steht nach der Bestätigung schon im Kalender – kein zweiter Anhang
  RESERVATION_REMINDER: { subject: "mail.reminder.subject", intro: "mail.reminder.intro", extra: "mail.reminder.cancelHint", withManage: true, ics: false },
  RESERVATION_CANCELLED_GUEST: {
    subject: "mail.cancelledGuest.subject",
    intro: "mail.cancelledGuest.intro",
    withManage: false,
    cancelled: true,
  },
  RESERVATION_CANCELLED_RESTAURANT: {
    subject: "mail.cancelledRestaurant.subject",
    intro: "mail.cancelledRestaurant.intro",
    withManage: false,
    cancelled: true,
  },
};

async function loadForMail(reservationId: string) {
  return db.reservation.findUnique({
    where: { id: reservationId },
    include: {
      restaurant: { include: { branding: true } },
      tables: { include: { table: { select: { name: true } } } },
    },
  });
}

type MailReservation = NonNullable<Awaited<ReturnType<typeof loadForMail>>>;

function address(r: MailReservation["restaurant"]): string {
  return [r.street, [r.postalCode, r.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function buildGuestMail(type: EmailType, r: MailReservation): EmailMessage | null {
  const tpl = GUEST_TEMPLATES[type];
  if (!tpl || !r.guestEmail) return null;
  const locale = toLocale(r.locale);
  const t = getTranslator(locale);
  const tz = r.restaurant.timezone;
  const date = formatDateLong(r.startsAt, locale, tz);
  const time = formatTime(r.startsAt, locale, tz);
  const restaurant = r.restaurant.name;
  const tableNames = r.tables.filter((x) => x.active || tpl.cancelled).map((x) => x.table.name);

  const token = r.manageTokenHash ? manageTokenFor(r.id, r.tokenVersion) : null;
  const link = token ? manageUrl(r.restaurant.slug, token, locale) : null;

  const details = [
    { label: t("mail.details.date"), value: date },
    { label: t("mail.details.time"), value: time },
    { label: t("mail.details.party"), value: String(r.partySize) },
    ...(tableNames.length && !tpl.cancelled ? [{ label: t("mail.details.table"), value: tableNames.join(" + ") }] : []),
    { label: t("mail.details.code"), value: r.code },
    ...(address(r.restaurant) ? [{ label: t("mail.details.address"), value: address(r.restaurant) }] : []),
  ];

  const layout: MailLayoutInput = {
    lang: locale,
    brandColor: r.restaurant.branding?.primaryColor ?? "#6b1e2e",
    restaurantName: restaurant,
    heading: t(tpl.subject, { restaurant, date }),
    greeting: t("mail.greeting", { name: r.guestName ?? "" }),
    paragraphs: [
      t(tpl.intro, { restaurant }),
      ...(tpl.extra ? [t(tpl.extra, { restaurant })] : []),
      ...(tpl.cancelled || tpl.ics === false ? [] : [t("mail.ics")]),
    ],
    details,
    cta: tpl.withManage && link ? { label: t("mail.manage"), url: link, hint: t("mail.manageHint") } : undefined,
    footer: t("mail.footer", { restaurant }),
    cancelled: tpl.cancelled,
  };

  const ics = buildIcs({
    uid: `${r.id}@ae-nova`,
    sequence: r.icsSequence,
    start: r.startsAt,
    end: r.endsAt,
    summary: `${restaurant} – ${r.partySize} ${locale === "de" ? "Pers." : "guests"}`,
    description: [`${t("mail.details.code")}: ${r.code}`, link ? `${t("mail.manage")}: ${link}` : ""].filter(Boolean).join("\n"),
    location: address(r.restaurant) || restaurant,
    url: link ?? undefined,
    organizerName: restaurant,
    organizerEmail: r.restaurant.email,
    cancelled: tpl.cancelled,
  });

  return {
    to: r.guestEmail,
    subject: layout.heading,
    html: renderMailHtml(layout),
    text: renderMailText(layout),
    replyTo: r.restaurant.email,
    attachments: tpl.ics === false ? [] : [{ filename: "reservierung.ics", content: ics, contentType: "text/calendar; charset=utf-8" }],
  };
}

/** Benachrichtigungen an das Restaurant (immer Deutsch, mit Link in den Admin). */
function buildRestaurantMail(type: EmailType, r: MailReservation): EmailMessage | null {
  const heading =
    type === "RESTAURANT_NEW_RESERVATION"
      ? r.status === "REQUESTED"
        ? "Neue Reservierungsanfrage – bitte bestätigen"
        : "Neue Online-Reservierung"
      : type === "RESTAURANT_RESERVATION_MODIFIED"
        ? "Reservierung vom Gast geändert"
        : type === "RESTAURANT_CANCELLATION"
          ? "Reservierung vom Gast storniert"
          : null;
  if (!heading) return null;
  const tz = r.restaurant.timezone;
  const adminUrl = new URL(`/admin/${r.restaurant.slug}/reservierungen?id=${r.id}`, env().APP_URL).toString();
  const layout: MailLayoutInput = {
    lang: "de",
    brandColor: "#1d2433",
    restaurantName: r.restaurant.name,
    heading,
    paragraphs: type === "RESTAURANT_CANCELLATION" ? ["Der Tisch wurde automatisch wieder freigegeben."] : [],
    details: [
      { label: "Datum", value: formatDateLong(r.startsAt, "de", tz) },
      { label: "Uhrzeit", value: formatTime(r.startsAt, "de", tz) },
      { label: "Personen", value: String(r.partySize) },
      { label: "Gast", value: r.guestName ?? "–" },
      { label: "Tisch", value: r.tables.filter((x) => x.active).map((x) => x.table.name).join(" + ") || "–" },
      { label: "Buchungsnummer", value: r.code },
      ...(r.guestNotes ? [{ label: "Anmerkung", value: r.guestNotes }] : []),
    ],
    cta: { label: "Im Admin öffnen", url: adminUrl },
    footer: "A&E NOVA Reservierungen",
    cancelled: type === "RESTAURANT_CANCELLATION",
  };
  return {
    to: r.restaurant.email,
    subject: `${heading}: ${formatDateLong(r.startsAt, "de", tz)}, ${formatTime(r.startsAt, "de", tz)} Uhr, ${r.partySize} P.`,
    html: renderMailHtml(layout),
    text: renderMailText(layout),
    replyTo: r.guestEmail ?? undefined,
  };
}

/** Ein "sending"-Claim, der älter als 10 Minuten ist, gilt als abgebrochen (Prozess-Absturz). */
const staleClaim = () => ({ providerMessageId: "sending", createdAt: { lt: new Date(Date.now() - 10 * 60_000) } });

/** Eine vorgemerkte Mail versenden. Fehler werden protokolliert, nicht geworfen. */
async function sendOne(id: string): Promise<"SENT" | "FAILED" | "SKIPPED"> {
  // Atomar "beanspruchen", damit parallele Läufe dieselbe Mail nicht doppelt senden
  const claimed = await db.emailLog.updateMany({
    where: { id, status: { in: ["QUEUED", "FAILED"] }, OR: [{ providerMessageId: null }, staleClaim()] },
    data: { providerMessageId: "sending" },
  });
  if (claimed.count === 0) return "SKIPPED";

  const log = await db.emailLog.findUniqueOrThrow({ where: { id } });
  try {
    const r = log.reservationId ? await loadForMail(log.reservationId) : null;
    // Anonymisiert oder gelöscht → nichts mehr zu senden
    if (!r || r.anonymizedAt) {
      await db.emailLog.update({ where: { id }, data: { status: "SENT", providerMessageId: "skipped", error: "keine Daten" } });
      return "SKIPPED";
    }
    // Erinnerung nur, solange die Reservierung noch gilt (Storno zwischen Vormerken und Versand)
    if (log.type === "RESERVATION_REMINDER" && r.status !== "CONFIRMED") {
      await db.emailLog.update({ where: { id }, data: { status: "SENT", providerMessageId: "skipped", error: "nicht mehr bestätigt" } });
      return "SKIPPED";
    }
    const message = log.type.startsWith("RESTAURANT_") ? buildRestaurantMail(log.type, r) : buildGuestMail(log.type, r);
    if (!message) {
      await db.emailLog.update({ where: { id }, data: { status: "SENT", providerMessageId: "skipped", error: "kein Empfänger" } });
      return "SKIPPED";
    }
    const result = await emailProvider().send(message);
    await db.emailLog.update({ where: { id }, data: { status: "SENT", providerMessageId: result.id, error: null } });
    return "SENT";
  } catch (error) {
    await db.emailLog.update({
      where: { id },
      data: { status: "FAILED", providerMessageId: null, error: String(error instanceof Error ? error.message : error).slice(0, 500) },
    });
    console.error(`[mail] Versand fehlgeschlagen (${log.type}, ${id})`, error);
    return "FAILED";
  }
}

/** Direkt nach dem Commit aufrufen (z. B. über `after()` im Route-Handler). */
export async function dispatchEmails(ids: string[]): Promise<void> {
  for (const id of ids) await sendOne(id);
}

/** Cron: wartende oder fehlgeschlagene Mails der letzten 48 h erneut senden. */
export async function retryPendingEmails(limit = 50): Promise<{ sent: number; failed: number }> {
  const pending = await db.emailLog.findMany({
    where: {
      status: { in: ["QUEUED", "FAILED"] },
      OR: [{ providerMessageId: null }, staleClaim()],
      createdAt: { gt: new Date(Date.now() - 48 * 3_600_000) },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let sent = 0;
  let failed = 0;
  for (const { id } of pending) {
    const result = await sendOne(id);
    if (result === "SENT") sent++;
    if (result === "FAILED") failed++;
  }
  return { sent, failed };
}

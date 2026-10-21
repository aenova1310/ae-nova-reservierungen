/**
 * Texte für Gäste-Widget und E-Mails (Deutsch = Standard, Englisch).
 * Bewusst ohne Framework: kleine, typsichere Wörterbücher, die auf Server und
 * Client funktionieren. Der Admin-Bereich ist im MVP deutschsprachig.
 */
export type Locale = "de" | "en";
export const LOCALES: Locale[] = ["de", "en"];

export function toLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "de";
}

const de = {
  "widget.title": "Tisch reservieren",
  "widget.language": "English",
  "widget.step.party": "Personen",
  "widget.step.date": "Datum",
  "widget.step.time": "Uhrzeit",
  "widget.step.table": "Platz",
  "widget.step.contact": "Kontakt",
  "widget.party.label": "Wie viele Personen?",
  "widget.party.more": "Mehr als {max} Personen? Bitte rufen Sie uns an: {phone}",
  "widget.party.moreNoPhone": "Für mehr als {max} Personen schreiben Sie uns bitte direkt.",
  "widget.date.label": "An welchem Tag?",
  "widget.date.closed": "An diesem Tag ist geschlossen.",
  "widget.time.label": "Zu welcher Uhrzeit?",
  "widget.time.none": "An diesem Tag ist leider nichts mehr frei. Bitte wählen Sie einen anderen Tag.",
  "widget.time.loading": "Freie Zeiten werden geladen …",
  "widget.time.duration": "Ihr Tisch ist für etwa {duration} reserviert.",
  "widget.area.label": "Wo möchten Sie sitzen?",
  "widget.area.any": "Egal – bester freier Platz",
  "widget.table.label": "Welcher Tisch?",
  "widget.table.seats": "{min}–{max} Plätze",
  "widget.table.preview": "So sitzen Sie",
  "widget.table.noPreview": "Für diesen Tisch gibt es noch keine Ansicht.",
  "widget.table.auto": "Tisch automatisch zuweisen",
  "widget.table.enlarge": "Vergrößern",
  "widget.table.start360": "360°-Ansicht starten",
  "widget.table.hint360": "Ziehen oder Pfeiltasten zum Umsehen, Strg + Mausrad zum Zoomen.",
  "widget.table.error360": "Die 360°-Ansicht kann in diesem Browser nicht angezeigt werden.",
  "widget.table.has360": "360°",
  "widget.table.hasPhoto": "Foto",
  "widget.contact.name": "Name",
  "widget.contact.email": "E-Mail",
  "widget.contact.phone": "Telefon",
  "widget.contact.notes": "Anmerkungen (optional)",
  "widget.contact.notesHint": "Z. B. Kinderstuhl oder Anlass. Bitte keine Gesundheitsangaben – Allergien besprechen Sie am besten direkt mit dem Service.",
  "widget.contact.privacy": "Ich habe die Datenschutzhinweise gelesen.",
  "widget.contact.privacyLink": "Datenschutzhinweise anzeigen",
  "widget.contact.submit": "Verbindlich reservieren",
  "widget.contact.submitRequest": "Reservierung anfragen",
  "widget.contact.required": "Bitte ausfüllen.",
  "widget.contact.invalidEmail": "Bitte eine gültige E-Mail-Adresse eingeben.",
  "widget.contact.invalidPhone": "Bitte eine gültige Telefonnummer eingeben.",
  "widget.contact.privacyRequired": "Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.",
  "widget.summary": "{party} · {date} · {time} Uhr",
  "widget.persons": "{count} Person|{count} Personen",
  "widget.back": "Zurück",
  "widget.next": "Weiter",
  "widget.change": "Ändern",
  "widget.done.confirmed": "Ihr Tisch ist reserviert.",
  "widget.done.requested": "Ihre Anfrage ist eingegangen.",
  "widget.done.requestedText": "Das Restaurant prüft Ihre Anfrage und meldet sich per E-Mail.",
  "widget.done.mail": "Die Bestätigung mit Kalendereintrag ist unterwegs an {email}.",
  "widget.done.code": "Buchungsnummer",
  "widget.done.table": "Tisch",
  "widget.done.another": "Weitere Reservierung",
  "widget.error.TABLE_TAKEN": "Dieser Zeitpunkt wurde gerade vergeben. Bitte wählen Sie eine andere Uhrzeit.",
  "widget.error.NO_TABLE": "Für diese Uhrzeit ist leider kein passender Tisch mehr frei.",
  "widget.error.QUOTA": "Online ist zu dieser Uhrzeit nichts mehr frei. Rufen Sie uns gern an.",
  "widget.error.TOO_SOON": "Diese Uhrzeit ist zu kurzfristig für eine Online-Reservierung.",
  "widget.error.RESTAURANT_SUSPENDED": "Online-Reservierungen sind derzeit nicht möglich.",
  "widget.error.RATE_LIMIT": "Zu viele Versuche. Bitte warten Sie einen Moment.",
  "widget.error.generic": "Das hat nicht geklappt. Bitte versuchen Sie es erneut oder rufen Sie uns an.",
  "widget.suspended": "Online-Reservierungen sind derzeit nicht möglich. Bitte kontaktieren Sie das Restaurant direkt.",
  "widget.poweredBy": "powered by A&E NOVA Reservierungen",
  "manage.title": "Ihre Reservierung",
  "manage.status.CONFIRMED": "Bestätigt",
  "manage.status.REQUESTED": "Angefragt – wartet auf Bestätigung",
  "manage.status.PENDING_PAYMENT": "Wartet auf Zahlung",
  "manage.status.CANCELLED": "Storniert",
  "manage.status.DECLINED": "Abgelehnt",
  "manage.status.EXPIRED": "Abgelaufen",
  "manage.status.ARRIVED": "Eingetroffen",
  "manage.status.NO_SHOW": "Nicht erschienen",
  "manage.cancel": "Reservierung stornieren",
  "manage.cancelConfirm": "Möchten Sie diese Reservierung wirklich stornieren? Der Tisch wird sofort wieder freigegeben.",
  "manage.cancelYes": "Ja, stornieren",
  "manage.cancelNo": "Nein, behalten",
  "manage.cancelled": "Ihre Reservierung ist storniert. Sie erhalten eine Bestätigung per E-Mail.",
  "manage.modify": "Datum, Uhrzeit oder Personen ändern",
  "manage.modifySave": "Änderung speichern",
  "manage.modified": "Ihre Reservierung wurde geändert. Sie erhalten eine neue Bestätigung per E-Mail.",
  "manage.past": "Diese Reservierung liegt in der Vergangenheit und kann nicht mehr geändert werden.",
  "manage.notFound": "Dieser Link ist ungültig oder abgelaufen.",
  "manage.calendar": "Zum Kalender hinzufügen",
  "manage.contact": "Fragen? {restaurant} erreichen Sie unter {phone}.",
  "privacy.default":
    "{restaurant} verarbeitet Ihre Angaben (Name, E-Mail, Telefon, Anmerkungen) ausschließlich zur Durchführung Ihrer Reservierung (Art. 6 Abs. 1 lit. b DSGVO). Technischer Dienstleister ist A&E NOVA Reservierungen (Auftragsverarbeitung, Server in der EU). Ihre Daten werden {days} Tage nach dem Reservierungsdatum anonymisiert. Sie haben das Recht auf Auskunft, Berichtigung, Löschung und Beschwerde bei einer Aufsichtsbehörde.",
  "privacy.more": "Vollständige Datenschutzerklärung",
  "mail.greeting": "Guten Tag {name},",
  "mail.confirmed.subject": "Ihre Reservierung bei {restaurant} am {date}",
  "mail.confirmed.intro": "vielen Dank für Ihre Reservierung. Wir freuen uns auf Ihren Besuch.",
  "mail.modified.subject": "Geänderte Reservierung bei {restaurant} am {date}",
  "mail.modified.intro": "Ihre Reservierung wurde geändert. Hier sind die aktuellen Daten:",
  "mail.requested.subject": "Ihre Anfrage bei {restaurant} am {date}",
  "mail.requested.intro": "vielen Dank für Ihre Anfrage. Das Restaurant prüft sie und meldet sich in Kürze.",
  "mail.declined.subject": "Ihre Anfrage bei {restaurant} am {date}",
  "mail.declined.intro": "leider kann {restaurant} Ihre Anfrage für diesen Termin nicht bestätigen. Gern können Sie einen anderen Zeitpunkt wählen.",
  "mail.cancelledGuest.subject": "Stornierung bestätigt – {restaurant}, {date}",
  "mail.cancelledGuest.intro": "Ihre Reservierung wurde wie gewünscht storniert.",
  "mail.cancelledRestaurant.subject": "Ihre Reservierung bei {restaurant} wurde storniert",
  "mail.cancelledRestaurant.intro": "leider musste {restaurant} Ihre Reservierung stornieren. Bei Fragen erreichen Sie das Restaurant direkt.",
  "mail.details.date": "Datum",
  "mail.details.time": "Uhrzeit",
  "mail.details.party": "Personen",
  "mail.details.table": "Tisch",
  "mail.details.code": "Buchungsnummer",
  "mail.details.address": "Adresse",
  "mail.manage": "Reservierung ändern oder stornieren",
  "mail.manageHint": "Sie können bis zum Reservierungszeitpunkt kostenlos über diesen Link stornieren.",
  "mail.ics": "Den Termin finden Sie als Kalenderdatei im Anhang.",
  "mail.footer": "Diese E-Mail wurde im Auftrag von {restaurant} über A&E NOVA Reservierungen versendet.",
} as const;

export type MessageKey = keyof typeof de;

const en: Record<MessageKey, string> = {
  "widget.title": "Book a table",
  "widget.language": "Deutsch",
  "widget.step.party": "Guests",
  "widget.step.date": "Date",
  "widget.step.time": "Time",
  "widget.step.table": "Seat",
  "widget.step.contact": "Contact",
  "widget.party.label": "How many guests?",
  "widget.party.more": "More than {max} guests? Please call us: {phone}",
  "widget.party.moreNoPhone": "For more than {max} guests, please contact us directly.",
  "widget.date.label": "Which day?",
  "widget.date.closed": "We are closed on this day.",
  "widget.time.label": "What time?",
  "widget.time.none": "Unfortunately there is nothing available on this day. Please choose another day.",
  "widget.time.loading": "Loading available times …",
  "widget.time.duration": "Your table is reserved for about {duration}.",
  "widget.area.label": "Where would you like to sit?",
  "widget.area.any": "No preference – best available",
  "widget.table.label": "Which table?",
  "widget.table.seats": "{min}–{max} seats",
  "widget.table.preview": "Your view",
  "widget.table.noPreview": "There is no preview for this table yet.",
  "widget.table.auto": "Assign a table for me",
  "widget.table.enlarge": "Enlarge",
  "widget.table.start360": "Start 360° view",
  "widget.table.hint360": "Drag or use arrow keys to look around, Ctrl + scroll to zoom.",
  "widget.table.error360": "The 360° view cannot be shown in this browser.",
  "widget.table.has360": "360°",
  "widget.table.hasPhoto": "Photo",
  "widget.contact.name": "Name",
  "widget.contact.email": "Email",
  "widget.contact.phone": "Phone",
  "widget.contact.notes": "Notes (optional)",
  "widget.contact.notesHint": "E.g. high chair or occasion. Please don't include health information – talk to our staff about allergies directly.",
  "widget.contact.privacy": "I have read the privacy notice.",
  "widget.contact.privacyLink": "Show privacy notice",
  "widget.contact.submit": "Confirm booking",
  "widget.contact.submitRequest": "Request booking",
  "widget.contact.required": "Please fill in.",
  "widget.contact.invalidEmail": "Please enter a valid email address.",
  "widget.contact.invalidPhone": "Please enter a valid phone number.",
  "widget.contact.privacyRequired": "Please confirm that you have read the privacy notice.",
  "widget.summary": "{party} · {date} · {time}",
  "widget.persons": "{count} guest|{count} guests",
  "widget.back": "Back",
  "widget.next": "Continue",
  "widget.change": "Change",
  "widget.done.confirmed": "Your table is booked.",
  "widget.done.requested": "We have received your request.",
  "widget.done.requestedText": "The restaurant will review your request and reply by email.",
  "widget.done.mail": "Your confirmation with calendar entry is on its way to {email}.",
  "widget.done.code": "Booking reference",
  "widget.done.table": "Table",
  "widget.done.another": "Make another booking",
  "widget.error.TABLE_TAKEN": "This time was just taken. Please choose another time.",
  "widget.error.NO_TABLE": "Unfortunately there is no suitable table left at this time.",
  "widget.error.QUOTA": "No more online availability at this time. Feel free to call us.",
  "widget.error.TOO_SOON": "This time is too soon for an online booking.",
  "widget.error.RESTAURANT_SUSPENDED": "Online bookings are currently unavailable.",
  "widget.error.RATE_LIMIT": "Too many attempts. Please wait a moment.",
  "widget.error.generic": "Something went wrong. Please try again or give us a call.",
  "widget.suspended": "Online bookings are currently unavailable. Please contact the restaurant directly.",
  "widget.poweredBy": "powered by A&E NOVA Reservierungen",
  "manage.title": "Your booking",
  "manage.status.CONFIRMED": "Confirmed",
  "manage.status.REQUESTED": "Requested – awaiting confirmation",
  "manage.status.PENDING_PAYMENT": "Awaiting payment",
  "manage.status.CANCELLED": "Cancelled",
  "manage.status.DECLINED": "Declined",
  "manage.status.EXPIRED": "Expired",
  "manage.status.ARRIVED": "Arrived",
  "manage.status.NO_SHOW": "No-show",
  "manage.cancel": "Cancel booking",
  "manage.cancelConfirm": "Do you really want to cancel this booking? The table will be released immediately.",
  "manage.cancelYes": "Yes, cancel",
  "manage.cancelNo": "No, keep it",
  "manage.cancelled": "Your booking has been cancelled. You will receive a confirmation by email.",
  "manage.modify": "Change date, time or guests",
  "manage.modifySave": "Save changes",
  "manage.modified": "Your booking has been changed. You will receive a new confirmation by email.",
  "manage.past": "This booking is in the past and can no longer be changed.",
  "manage.notFound": "This link is invalid or has expired.",
  "manage.calendar": "Add to calendar",
  "manage.contact": "Questions? You can reach {restaurant} at {phone}.",
  "privacy.default":
    "{restaurant} processes your details (name, email, phone, notes) solely to handle your booking (Art. 6(1)(b) GDPR). The technical service provider is A&E NOVA Reservierungen (data processor, servers in the EU). Your data will be anonymised {days} days after the booking date. You have the right to access, rectification, erasure and to lodge a complaint with a supervisory authority.",
  "privacy.more": "Full privacy policy",
  "mail.greeting": "Dear {name},",
  "mail.confirmed.subject": "Your booking at {restaurant} on {date}",
  "mail.confirmed.intro": "thank you for your booking. We look forward to welcoming you.",
  "mail.modified.subject": "Updated booking at {restaurant} on {date}",
  "mail.modified.intro": "your booking has been changed. Here are the current details:",
  "mail.requested.subject": "Your request at {restaurant} on {date}",
  "mail.requested.intro": "thank you for your request. The restaurant will review it and get back to you shortly.",
  "mail.declined.subject": "Your request at {restaurant} on {date}",
  "mail.declined.intro": "unfortunately {restaurant} cannot confirm your request for this time. You are welcome to choose another time.",
  "mail.cancelledGuest.subject": "Cancellation confirmed – {restaurant}, {date}",
  "mail.cancelledGuest.intro": "your booking has been cancelled as requested.",
  "mail.cancelledRestaurant.subject": "Your booking at {restaurant} has been cancelled",
  "mail.cancelledRestaurant.intro": "unfortunately {restaurant} had to cancel your booking. Please contact the restaurant directly if you have any questions.",
  "mail.details.date": "Date",
  "mail.details.time": "Time",
  "mail.details.party": "Guests",
  "mail.details.table": "Table",
  "mail.details.code": "Booking reference",
  "mail.details.address": "Address",
  "mail.manage": "Change or cancel booking",
  "mail.manageHint": "You can cancel free of charge via this link until the time of your booking.",
  "mail.ics": "You will find the appointment attached as a calendar file.",
  "mail.footer": "This email was sent on behalf of {restaurant} via A&E NOVA Reservierungen.",
};

const dictionaries: Record<Locale, Record<MessageKey, string>> = { de, en };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Übersetzungsfunktion. Platzhalter: {name}. Pluralformen: "Singular|Plural",
 * gesteuert über die Variable `count`.
 */
export function getTranslator(locale: Locale): Translate {
  const dict = dictionaries[locale];
  return (key, vars = {}) => {
    let text = dict[key] ?? de[key] ?? key;
    if (text.includes("|") && typeof vars.count === "number") {
      const [one, many] = text.split("|");
      text = vars.count === 1 ? one : many;
    }
    return text.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
  };
}

/** Datums-/Zeitformatierung in der Zeitzone des Restaurants. */
export function formatDateLong(instant: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(instant);
}

export function formatTime(instant: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(instant);
}

export function formatDuration(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (locale === "de") return m === 0 ? `${h} Std.` : h === 0 ? `${m} Min.` : `${h} Std. ${m} Min.`;
  return m === 0 ? `${h} h` : h === 0 ? `${m} min` : `${h} h ${m} min`;
}

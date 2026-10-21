/**
 * Kalenderdatei nach RFC 5545.
 * - UID bleibt pro Reservierung gleich → Kalender aktualisieren statt duplizieren
 * - SEQUENCE steigt bei jeder Änderung
 * - Storno: METHOD:CANCEL + STATUS:CANCELLED
 */
export interface IcsEvent {
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizerName?: string;
  organizerEmail?: string;
  cancelled?: boolean;
  now?: Date;
}

/** UTC-Zeitstempel im Format 20261103T170000Z. */
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Text-Escaping nach RFC 5545 §3.3.11. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Zeilen auf 75 Oktette falten (RFC 5545 §3.1), UTF-8-sicher. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const len = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? 75 : 74; // Folgezeilen beginnen mit einem Leerzeichen
    if (currentBytes + len > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += len;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//A&E NOVA//Reservierungen//DE",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${stamp(event.now ?? new Date())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    event.description ? `DESCRIPTION:${escapeText(event.description)}` : null,
    event.location ? `LOCATION:${escapeText(event.location)}` : null,
    event.url ? `URL:${event.url}` : null,
    event.organizerEmail
      ? `ORGANIZER;CN=${escapeText(event.organizerName ?? event.organizerEmail)}:mailto:${event.organizerEmail}`
      : null,
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

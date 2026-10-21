import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
import { env } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string }>;
}

/**
 * Versand über Resend. Die Absenderdomain sollte in Resend mit der Region
 * eu-west-1 angelegt sein (Versand aus der EU).
 */
class ResendProvider implements EmailProvider {
  private client: Resend;
  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }
  async send(message: EmailMessage) {
    const { data, error } = await this.client.emails.send({
      from: env().EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, "utf8"),
        contentType: a.contentType,
      })),
    });
    if (error || !data) throw new Error(`Resend: ${error?.message ?? "unbekannter Fehler"}`);
    return { id: data.id };
  }
}

/**
 * Entwicklung: Mails werden nicht verschickt, sondern als HTML-Datei unter
 * `.mail-outbox/` abgelegt (inkl. .ics) und in der Konsole angekündigt.
 */
class FileProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const dir = path.join(process.cwd(), ".mail-outbox");
    await mkdir(dir, { recursive: true });
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    const header = `<!-- To: ${message.to}\n     Subject: ${message.subject}\n     Reply-To: ${message.replyTo ?? "-"} -->\n`;
    await writeFile(path.join(dir, `${id}.html`), header + message.html, "utf8");
    for (const a of message.attachments ?? []) {
      await writeFile(path.join(dir, `${id}-${a.filename}`), a.content, "utf8");
    }
    console.info(`[mail] ${message.subject} → ${message.to} (.mail-outbox/${id}.html)`);
    return { id: `file-${id}` };
  }
}

let provider: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  if (!provider) {
    const key = env().RESEND_API_KEY;
    provider = key ? new ResendProvider(key) : new FileProvider();
  }
  return provider;
}

/** Für Tests: Provider austauschen. */
export function setEmailProvider(p: EmailProvider | null) {
  provider = p;
}

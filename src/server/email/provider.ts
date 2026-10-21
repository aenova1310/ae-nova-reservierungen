import "server-only";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
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
 * Ohne RESEND_API_KEY (Entwicklung, Test-Server): Mails werden nicht verschickt,
 * sondern unter `.mail-outbox/` abgelegt – als HTML (Ansicht), als Text (für
 * `deploy/mails.sh`) und mit Anhängen. Der Job `cleanup` löscht sie nach 14 Tagen.
 */
class FileProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const dir = path.join(process.cwd(), ".mail-outbox");
    await mkdir(dir, { recursive: true });
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    const header = `<!-- To: ${message.to}\n     Subject: ${message.subject}\n     Reply-To: ${message.replyTo ?? "-"} -->\n`;
    await writeFile(path.join(dir, `${id}.html`), header + message.html, "utf8");
    await writeFile(path.join(dir, `${id}.txt`), `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`, "utf8");
    for (const a of message.attachments ?? []) {
      await writeFile(path.join(dir, `${id}-${a.filename}`), a.content, "utf8");
    }
    console.info(`[mail] ${message.subject} → ${message.to} (.mail-outbox/${id}.html)`);
    return { id: `file-${id}` };
  }
}

/** Abgelegte Mails nach `days` Tagen löschen (enthalten Gastdaten). Liefert die Anzahl gelöschter Dateien. */
export async function pruneFileOutbox(days = 14): Promise<number> {
  const dir = path.join(process.cwd(), ".mail-outbox");
  const cutoff = Date.now() - days * 86_400_000;
  let removed = 0;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0; // kein Ordner → nichts zu tun
  }
  for (const name of names) {
    const file = path.join(dir, name);
    if ((await stat(file)).mtimeMs < cutoff) {
      await rm(file, { force: true });
      removed++;
    }
  }
  return removed;
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

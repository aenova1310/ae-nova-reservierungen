import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

// argon2id mit OWASP-empfohlenen Parametern (19 MiB, 2 Iterationen)
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export const PASSWORD_MIN_LENGTH = 10;

/** Neues Passwort mit Wiederholung (Passwort-Seite und Einladung). */
export const newPasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`).max(200, "Höchstens 200 Zeichen"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Die Passwörter stimmen nicht überein.", path: ["confirm"] });

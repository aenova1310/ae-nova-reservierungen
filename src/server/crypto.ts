import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Zufälliges, URL-sicheres Token (Standard 32 Byte = 256 Bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256-Hash eines Tokens. In der DB liegt nie das Klartext-Token. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Kurzer, gut vorlesbarer Buchungscode ohne verwechselbare Zeichen (0/O, 1/I). */
export function reservationCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

import "server-only";
import { hash, verify } from "@node-rs/argon2";

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

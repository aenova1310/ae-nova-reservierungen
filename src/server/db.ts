import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

/**
 * Roher Prisma-Client. Nur innerhalb von src/server/** importieren (ESLint-Regel).
 * Mandantenbezogene Zugriffe laufen über `tenantDb()` aus ./tenancy.
 */
function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { novaPrisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.novaPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.novaPrisma = db;

export type Db = typeof db;
/** Client innerhalb einer interaktiven Transaktion. */
export type Tx = Prisma.TransactionClient;

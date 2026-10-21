import "server-only";
import { db } from "../db";

/**
 * Tenant-Scoped Prisma Client.
 *
 * Erzwingt bei allen Modellen mit `restaurantId`, dass ausschließlich Daten des
 * übergebenen Restaurants gelesen oder geschrieben werden – unabhängig davon,
 * ob der aufrufende Code daran denkt. Fremde IDs führen so zu "nicht gefunden"
 * statt zu einem Datenleck.
 */
const TENANT_MODELS = new Set([
  "RestaurantSettings",
  "Branding",
  "StripeAccount",
  "Area",
  "Table",
  "TableCombination",
  "TableMedia",
  "Shift",
  "DateException",
  "DurationRule",
  "Reservation",
  "ReservationTable",
  "Payment",
  "EmailLog",
  "StatsDaily",
  "PrivacyRequest",
  "AuditLog",
]);

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type AnyArgs = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown; create?: unknown };

function scopeArgs(operation: string, args: AnyArgs, restaurantId: string): AnyArgs {
  const next: AnyArgs = { ...args };
  if (WHERE_OPS.has(operation)) {
    next.where = { ...(args.where ?? {}), restaurantId };
  }
  if (operation === "create") {
    next.data = { ...(args.data as object), restaurantId };
  }
  if (operation === "createMany" || operation === "createManyAndReturn") {
    const data = Array.isArray(args.data) ? args.data : [args.data];
    next.data = data.map((d) => ({ ...(d as object), restaurantId }));
  }
  if (operation === "upsert") {
    next.where = { ...(args.where ?? {}), restaurantId };
    next.create = { ...(args.create as object), restaurantId };
  }
  return next;
}

export function tenantDb(restaurantId: string) {
  if (!restaurantId) throw new Error("tenantDb: restaurantId fehlt");
  return db.$extends({
    name: `tenant:${restaurantId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          // Prisma-Typen sind hier generisch; die Ergänzung von restaurantId ist für alle Tenant-Modelle gültig.
          return query(scopeArgs(operation, (args ?? {}) as AnyArgs, restaurantId) as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

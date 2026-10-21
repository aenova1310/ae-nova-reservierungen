import "server-only";
import type { AdminT } from "@/i18n/admin";
import type { TenantDb } from "../tenancy/tenant-db";

/** Auswahlliste für manuelle Buchungen: Tische und Kombinationen, nach Bereich gruppiert. */
export async function seatOptions(tdb: TenantDb, t: AdminT) {
  const [areas, combos] = await Promise.all([
    tdb.area.findMany({
      orderBy: { sortOrder: "asc" },
      include: { tables: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
    }),
    tdb.tableCombination.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return [
    ...areas.map((a) => ({
      label: a.name,
      options: a.tables.map((table) => ({ value: `table:${table.id}`, label: t("res.seat.option", { name: table.name, min: table.minCapacity, max: table.maxCapacity }) })),
    })),
    ...(combos.length
      ? [{ label: t("res.seat.combinations"), options: combos.map((c) => ({ value: `combination:${c.id}`, label: t("res.seat.option", { name: c.name, min: c.minCapacity, max: c.maxCapacity }) })) }]
      : []),
  ];
}

export type SeatOptionGroups = Awaited<ReturnType<typeof seatOptions>>;

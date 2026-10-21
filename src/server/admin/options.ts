import "server-only";
import type { TenantDb } from "../tenancy/tenant-db";

/** Auswahlliste für manuelle Buchungen: Tische und Kombinationen, nach Bereich gruppiert. */
export async function seatOptions(tdb: TenantDb) {
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
      options: a.tables.map((t) => ({ value: `table:${t.id}`, label: `${t.name} (${t.minCapacity}–${t.maxCapacity} P.)` })),
    })),
    ...(combos.length
      ? [{ label: "Kombinationen", options: combos.map((c) => ({ value: `combination:${c.id}`, label: `${c.name} (${c.minCapacity}–${c.maxCapacity} P.)` })) }]
      : []),
  ];
}

export type SeatOptionGroups = Awaited<ReturnType<typeof seatOptions>>;

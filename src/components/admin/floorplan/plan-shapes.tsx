import { useAdminT } from "@/components/admin/i18n-provider";
import type { PlanArea, PlanTable } from "@/lib/floorplan";

/**
 * Zeichnung von Bereichen und Tischen (rein darstellend, ohne Interaktion).
 * Tisch-Koordinaten: (x, y) = linke obere Ecke, Drehung um die Mitte.
 */

const MAX_DRAWN_SEATS = 16;
const SEAT = 7; // Stuhl-Radius

/** Stuhlpositionen relativ zur linken oberen Ecke des ungedrehten Tisches. */
export function seatPositions(t: Pick<PlanTable, "width" | "height" | "shape" | "maxCapacity">): { x: number; y: number }[] {
  const n = Math.min(t.maxCapacity, MAX_DRAWN_SEATS);
  const cx = t.width / 2;
  const cy = t.height / 2;
  const gap = SEAT + 3;
  if (t.shape === "ROUND") {
    const r = t.width / 2 + gap;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
  }
  // Rechteckig: Stühle an den beiden langen Seiten; bei Quadraten reihum an allen vier
  const sides: ("top" | "bottom" | "left" | "right")[] =
    t.shape === "SQUARE" && n > 2 ? ["top", "bottom", "left", "right"] : t.width >= t.height ? ["top", "bottom"] : ["left", "right"];
  const perSide = new Map(sides.map((s) => [s, 0]));
  for (let i = 0; i < n; i++) perSide.set(sides[i % sides.length], perSide.get(sides[i % sides.length])! + 1);
  const out: { x: number; y: number }[] = [];
  for (const [side, count] of perSide) {
    for (let i = 0; i < count; i++) {
      const f = (i + 1) / (count + 1);
      if (side === "top") out.push({ x: t.width * f, y: -gap });
      if (side === "bottom") out.push({ x: t.width * f, y: t.height + gap });
      if (side === "left") out.push({ x: -gap, y: t.height * f });
      if (side === "right") out.push({ x: t.width + gap, y: t.height * f });
    }
  }
  return out;
}

export function TableShapeSvg({ table, selected }: { table: PlanTable; selected: boolean }) {
  const stroke = selected ? "var(--nova-bordeaux)" : "var(--nova-tinte)";
  const common = {
    fill: table.active ? "#ffffff" : "var(--muted)",
    stroke,
    strokeWidth: selected ? 2.5 : 1.25,
    strokeDasharray: table.active ? undefined : "4 3",
  };
  return (
    <>
      {seatPositions(table).map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={SEAT} fill="var(--nova-linie)" stroke="var(--nova-schiefer)" strokeWidth={0.75} />
      ))}
      {table.shape === "ROUND" ? (
        <ellipse cx={table.width / 2} cy={table.height / 2} rx={table.width / 2} ry={table.height / 2} {...common} />
      ) : (
        <rect width={table.width} height={table.height} rx={6} {...common} />
      )}
    </>
  );
}

/** Beschriftung bleibt aufrecht, auch wenn der Tisch gedreht ist. */
export function TableLabel({ table }: { table: PlanTable }) {
  const { t } = useAdminT();
  const cx = table.x + table.width / 2;
  const cy = table.y + table.height / 2;
  const capacity = table.minCapacity === table.maxCapacity ? `${table.maxCapacity}` : `${table.minCapacity}–${table.maxCapacity}`;
  return (
    <text x={cx} y={cy} textAnchor="middle" className="pointer-events-none select-none" fill="var(--nova-tinte)">
      <tspan x={cx} dy="-0.15em" fontSize={13} fontWeight={600}>
        {table.name}
      </tspan>
      <tspan x={cx} dy="1.2em" fontSize={11} fill="var(--nova-schiefer)">
        {table.active ? t("fp.seatsShort", { capacity }) : t("fp.inactive")}
      </tspan>
    </text>
  );
}

export function AreaShapeSvg({ area, selected }: { area: PlanArea; selected: boolean }) {
  return (
    <>
      <rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        rx={4}
        fill={area.color ?? "#EEF0EC"}
        stroke={selected ? "var(--nova-bordeaux)" : "var(--nova-linie)"}
        strokeWidth={selected ? 2 : 1.5}
      />
    </>
  );
}

/** Name als kleines Schild oben links (eigene Ebene über den Tischen). */
export function AreaLabel({ area }: { area: PlanArea }) {
  const width = Math.min(area.width - 8, area.name.length * 7.2 + 16);
  return (
    <g className="pointer-events-none select-none" aria-hidden>
      <rect x={area.x + 4} y={area.y + 4} width={width} height={20} rx={4} fill="#ffffff" fillOpacity={0.85} />
      <text x={area.x + 12} y={area.y + 18} fontSize={12} fill="var(--nova-schiefer)">
        {area.name.length * 7.2 + 16 > area.width - 8 ? `${area.name.slice(0, Math.max(1, Math.floor((area.width - 30) / 7.2)))}…` : area.name}
      </text>
    </g>
  );
}

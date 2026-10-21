import { Ban, CheckCircle2, CircleDashed, CircleUserRound, Clock3, CreditCard, UserX, XCircle, type LucideIcon } from "lucide-react";
import { isAdminKey, type AdminT } from "@/i18n/admin";
import { cn } from "@/lib/utils";
import { getAdminT } from "@/server/i18n";

/** Statusbezeichnung in der Benutzersprache (unbekannter Status bleibt unverändert). */
export function statusLabel(t: AdminT, status: string): string {
  const key = `res.status.${status}`;
  return isAdminKey(key) ? t(key) : status;
}

/** Herkunft der Reservierung (Online, Telefon, …) in der Benutzersprache. */
export function sourceLabel(t: AdminT, source: string): string {
  const key = `res.source.${source}`;
  return isAdminKey(key) ? t(key) : source;
}

/** Status nie nur über Farbe – immer mit Symbol und Text (Barrierefreiheit). */
const STYLE: Record<string, { icon: LucideIcon; className: string }> = {
  PENDING_PAYMENT: { icon: CreditCard, className: "border-messing/40 bg-messing/10 text-[#6f5527]" },
  REQUESTED: { icon: Clock3, className: "border-messing/40 bg-messing/10 text-[#6f5527]" },
  CONFIRMED: { icon: CheckCircle2, className: "border-[#1d2433]/20 bg-[#1d2433]/5 text-[#1d2433]" },
  ARRIVED: { icon: CircleUserRound, className: "border-salbei/30 bg-salbei/10 text-salbei" },
  NO_SHOW: { icon: UserX, className: "border-bordeaux/30 bg-bordeaux/10 text-bordeaux" },
  CANCELLED: { icon: XCircle, className: "border-border bg-muted text-muted-foreground line-through" },
  EXPIRED: { icon: CircleDashed, className: "border-border bg-muted text-muted-foreground" },
  DECLINED: { icon: Ban, className: "border-border bg-muted text-muted-foreground" },
};

export async function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { t } = await getAdminT();
  const s = STYLE[status] ?? STYLE.CONFIRMED;
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.className, className)}>
      <Icon className="size-3.5" aria-hidden />
      {statusLabel(t, status)}
    </span>
  );
}

/** Farben für Balken im Tagesplan. */
export const STATUS_BAR: Record<string, string> = {
  PENDING_PAYMENT: "bg-messing/20 border-messing text-[#5a4520]",
  REQUESTED: "bg-messing/20 border-messing text-[#5a4520]",
  CONFIRMED: "bg-[#1d2433]/10 border-[#1d2433] text-[#1d2433]",
  ARRIVED: "bg-salbei/15 border-salbei text-[#2c4b37]",
  NO_SHOW: "bg-bordeaux/10 border-bordeaux text-bordeaux",
};

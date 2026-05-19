import { formatMoneyPhp } from "@/lib/utils/format";

export { formatMoneyPhp };

export const OWNER_DASH_BRAND = "#2D7FF9";
export const OWNER_DASH_DANGER = "#FF4D4F";

export const OWNER_DASH_PAGE_CLASS = "bg-[#F3F4F6]";

/** @deprecated shell `OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS` 사용 — 중복 pb 방지 */
export const OWNER_HUB_OPS_SCROLL_PADDING_CLASS = "";

export const ownerDashTypography = {
  sectionTitle: "text-[14px] font-semibold leading-snug text-gray-900",
  metric: "text-[18px] font-bold leading-tight tabular-nums text-gray-900",
  metricUrgent: "text-[18px] font-bold leading-tight tabular-nums text-[#DC2626]",
  helper: "text-[11px] font-normal leading-snug text-gray-500",
  label: "text-[12px] font-medium leading-snug text-gray-700",
  cellTitle: "text-[12px] font-medium text-gray-600",
} as const;

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function ownerDashCardClass(extra?: string): string {
  return cn("rounded-[4px] border border-[#E5E7EB] bg-white p-3 shadow-none", extra);
}

export function ownerDashUrgentCardClass(extra?: string): string {
  return cn(
    "rounded-[4px] border border-[#FECACA] bg-white p-3 shadow-none ring-1 ring-[#FEE2E2]",
    extra
  );
}

export function formatDeltaPercent(delta: number | null): string | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  return `어제 대비 ${sign}${delta}%`;
}

export function deltaToneClass(delta: number | null): string {
  if (delta == null) return "text-gray-500";
  if (delta > 0) return "text-emerald-700";
  if (delta < 0) return "text-[#DC2626]";
  return "text-gray-500";
}

export function formatOwnerDashUpdatedAt(d: Date): string {
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

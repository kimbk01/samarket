import { formatMoneyPhp } from "@/lib/utils/format";

export { formatMoneyPhp };

export const OWNER_DASH_BRAND = "#0B421A";
export const OWNER_DASH_DANGER = "#FF4D4F";

export const OWNER_DASH_PAGE_CLASS = "bg-[var(--biz-app-bg)]";

/** @deprecated shell `OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS` 사용 — 중복 pb 방지 */
export const OWNER_HUB_OPS_SCROLL_PADDING_CLASS = "";

export const ownerDashTypography = {
  sectionTitle: "text-[14px] font-semibold leading-snug text-[var(--biz-text)]",
  metric: "text-[18px] font-bold leading-tight tabular-nums text-[var(--biz-text)]",
  metricUrgent: "text-[18px] font-bold leading-tight tabular-nums text-[#DC2626]",
  helper: "text-[11px] font-normal leading-snug text-[var(--biz-text-muted)]",
  label: "text-[12px] font-medium leading-snug text-[var(--biz-text)]",
  cellTitle: "text-[12px] font-medium text-[var(--biz-text-muted)]",
} as const;

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function ownerDashCardClass(extra?: string): string {
  return cn(
    "rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-3 shadow-none",
    extra
  );
}

export function ownerDashUrgentCardClass(extra?: string): string {
  return cn(
    "rounded-[4px] border border-[#FECACA] bg-[var(--biz-card-bg)] p-3 shadow-none ring-1 ring-[#FEE2E2]",
    extra
  );
}

import type { MessageKey } from "@/lib/i18n/messages";

export function formatDeltaPercent(
  delta: number | null,
  t?: (key: MessageKey, params?: Record<string, string | number>) => string
): string | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  if (t) return t("store_owner_dash_delta_vs_yesterday", { sign, delta: String(delta) });
  return `${sign}${delta}%`;
}

export function deltaToneClass(delta: number | null): string {
  if (delta == null) return "text-[var(--biz-text-muted)]";
  if (delta > 0) return "text-emerald-700";
  if (delta < 0) return "text-[#DC2626]";
  return "text-[var(--biz-text-muted)]";
}

export function formatOwnerDashUpdatedAt(d: Date): string {
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

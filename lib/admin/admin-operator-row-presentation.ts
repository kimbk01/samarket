/**
 * Canonical Admin list row presentation for Promotion operator status.
 * UI-only — consumes promotionOperatorStatusTone. No new DB status.
 */
import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";
import {
  promotionOperatorStatusTone,
  type PromotionOperatorStatus,
} from "@/lib/admin/promotion-operation-status";

/** Notification campaign send lifecycle — not Promotion "노출 중". */
export type NotificationSendOperatorTone =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled"
  | "other";

const ROW_ACCENT: Record<AdminTone, string> = {
  success: "border-l-emerald-600 bg-emerald-50/40",
  waiting: "border-l-amber-500 bg-amber-50/30",
  warning: "border-l-orange-500 bg-orange-50/25",
  danger: "border-l-sam-border bg-sam-app/70",
  progress: "border-l-sky-500 bg-sky-50/30",
  neutral: "border-l-transparent bg-sam-surface",
};

export function adminOperatorRowClassFromTone(tone: AdminTone): string {
  return ["border-l-[3px]", ROW_ACCENT[tone] ?? ROW_ACCENT.neutral].join(" ");
}

export function adminOperatorRowClassFromPromotionStatus(
  status: PromotionOperatorStatus
): string {
  return adminOperatorRowClassFromTone(promotionOperatorStatusTone(status));
}

export function notificationSendOperatorTone(
  status: string | null | undefined
): AdminTone {
  const s = String(status || "").toLowerCase();
  if (s === "draft") return "neutral";
  if (s === "scheduled" || s === "active") return "waiting";
  if (s === "sending") return "progress";
  if (s === "sent") return "success";
  if (s === "failed" || s === "partially_failed") return "danger";
  if (s === "cancelled") return "warning";
  return "neutral";
}

export function adminOperatorRowClassFromNotificationStatus(
  status: string | null | undefined
): string {
  return adminOperatorRowClassFromTone(notificationSendOperatorTone(status));
}

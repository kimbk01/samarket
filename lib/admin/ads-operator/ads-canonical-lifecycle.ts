/**
 * Shared Ads canonical lifecycle labels — Admin ↔ Customer parity presentation.
 * Domain writers stay separate; this is label mapping only.
 */

export type AdsCanonicalLifecycle =
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "on_hold"
  | "approved"
  | "payment"
  | "scheduled"
  | "exposing"
  | "paused"
  | "hidden"
  | "rejected"
  | "ended"
  | "cancelled";

const LABELS: Record<AdsCanonicalLifecycle, { ko: string; en: string }> = {
  submitted: { ko: "접수", en: "Submitted" },
  in_review: { ko: "검토", en: "In review" },
  changes_requested: { ko: "수정 요청", en: "Changes requested" },
  on_hold: { ko: "보류", en: "On hold" },
  approved: { ko: "승인", en: "Approved" },
  payment: { ko: "결제", en: "Payment" },
  scheduled: { ko: "예약", en: "Scheduled" },
  exposing: { ko: "노출 중", en: "Live" },
  paused: { ko: "일시중지", en: "Paused" },
  hidden: { ko: "숨김", en: "Hidden" },
  rejected: { ko: "거절", en: "Rejected" },
  ended: { ko: "종료", en: "Ended" },
  cancelled: { ko: "취소", en: "Cancelled" },
};

export function adsCanonicalLifecycleLabel(
  stage: AdsCanonicalLifecycle,
  ko: boolean
): string {
  return ko ? LABELS[stage].ko : LABELS[stage].en;
}

/** Map Feed ops/member display status → canonical stage. */
export function feedDisplayToCanonical(
  display: string
): AdsCanonicalLifecycle {
  const s = String(display ?? "").trim().toLowerCase();
  if (s === "pending_review" || s === "pending" || s === "held") return "in_review";
  if (s === "scheduled") return "scheduled";
  if (s === "active") return "exposing";
  if (s === "paused") return "paused";
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  if (s === "ended" || s === "expired") return "ended";
  return "ended";
}

/** Map Delivery lifecycle string → canonical stage (presentation). */
export function deliveryLifecycleToCanonical(lifecycle: string): AdsCanonicalLifecycle {
  const life = String(lifecycle ?? "").trim().toUpperCase();
  if (life.includes("REVIEW") || life === "SUBMITTED" || life === "PENDING") return "in_review";
  if (life.includes("CHANGES") || life.includes("REVISION")) return "changes_requested";
  if (life.includes("HOLD")) return "on_hold";
  if (life === "APPROVED") return "approved";
  if (life === "SCHEDULED") return "scheduled";
  if (life === "ACTIVE") return "exposing";
  if (life.startsWith("PAUSED")) return "paused";
  if (life === "HIDDEN") return "hidden";
  if (life === "REJECTED") return "rejected";
  if (life === "CANCELLED") return "cancelled";
  if (life === "ENDED" || life === "ARCHIVED" || life === "TERMINATED") return "ended";
  return "in_review";
}

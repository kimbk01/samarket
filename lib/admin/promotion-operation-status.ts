/**
 * CUT 3 — Admin Platform Promotion operator status SSOT (UI only).
 * Maps existing persisted fields → DRAFT | SCHEDULED | ACTIVE | PAUSED | ENDED.
 * Does NOT invent a new persisted status column.
 */

export const PROMOTION_OPERATOR_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "ENDED",
] as const;

export type PromotionOperatorStatus = (typeof PROMOTION_OPERATOR_STATUSES)[number];

export type PromotionOperatorStatusLabelLang = "ko" | "en";

export function promotionOperatorStatusLabel(
  status: PromotionOperatorStatus,
  lang: PromotionOperatorStatusLabelLang = "ko"
): string {
  const ko: Record<PromotionOperatorStatus, string> = {
    DRAFT: "초안",
    SCHEDULED: "예약",
    ACTIVE: "노출 중",
    PAUSED: "중지",
    ENDED: "종료",
  };
  const en: Record<PromotionOperatorStatus, string> = {
    DRAFT: "Draft",
    SCHEDULED: "Scheduled",
    ACTIVE: "Active",
    PAUSED: "Paused",
    ENDED: "Ended",
  };
  return lang === "en" ? en[status] : ko[status];
}

export type PromotionOperatorStatusTone =
  | "neutral"
  | "waiting"
  | "progress"
  | "success"
  | "warning"
  | "danger";

export function promotionOperatorStatusTone(
  status: PromotionOperatorStatus
): PromotionOperatorStatusTone {
  switch (status) {
    case "DRAFT":
      return "neutral";
    case "SCHEDULED":
      return "waiting";
    case "ACTIVE":
      return "success";
    case "PAUSED":
      return "warning";
    case "ENDED":
      return "danger";
  }
}

type WindowInput = {
  startsAt?: string | null;
  endsAt?: string | null;
};

function parseMs(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

/**
 * Event: draft | published | unpublished + startsAt/endsAt
 * unpublished after active window → PAUSED (operator “중지”)
 */
export function resolveEventOperatorStatus(
  row: {
    status?: string | null;
  } & WindowInput,
  nowMs: number = Date.now()
): PromotionOperatorStatus {
  const status = String(row.status ?? "").trim().toLowerCase();
  if (status === "draft") return "DRAFT";
  if (status === "unpublished") return "PAUSED";
  if (status !== "published") return "DRAFT";

  const start = parseMs(row.startsAt);
  const end = parseMs(row.endsAt);
  if (start != null && start > nowMs) return "SCHEDULED";
  if (end != null && end < nowMs) return "ENDED";
  return "ACTIVE";
}

/**
 * Popup campaign lifecycle → operator status.
 */
export function resolvePopupOperatorStatus(
  row: {
    status?: string | null;
  } & WindowInput,
  nowMs: number = Date.now()
): PromotionOperatorStatus {
  const status = String(row.status ?? "").trim().toLowerCase();
  if (status === "draft" || status === "pending_review" || status === "rejected") {
    return "DRAFT";
  }
  if (status === "paused") return "PAUSED";
  if (status === "ended") return "ENDED";
  if (status === "scheduled" || status === "approved") {
    const start = parseMs(row.startsAt);
    if (start != null && start > nowMs) return "SCHEDULED";
    if (status === "scheduled") return "SCHEDULED";
  }
  if (status === "active") {
    const end = parseMs(row.endsAt);
    if (end != null && end < nowMs) return "ENDED";
    const start = parseMs(row.startsAt);
    if (start != null && start > nowMs) return "SCHEDULED";
    return "ACTIVE";
  }
  // approved without schedule window → treat as scheduled/draft-ish schedule pending
  if (status === "approved") return "SCHEDULED";
  return "DRAFT";
}

/**
 * Banner / channel distribution row.
 * disabled → PAUSED; draft/configured + future → SCHEDULED; active window → ACTIVE; past → ENDED
 */
export function resolveDistributionOperatorStatus(
  row: {
    status?: string | null;
    enabled?: boolean | null;
  } & WindowInput,
  nowMs: number = Date.now()
): PromotionOperatorStatus {
  if (row.enabled === false || String(row.status ?? "").toLowerCase() === "disabled") {
    return "PAUSED";
  }
  const status = String(row.status ?? "").trim().toLowerCase();
  if (status === "draft") return "DRAFT";

  const start = parseMs(row.startsAt);
  const end = parseMs(row.endsAt);
  if (end != null && end < nowMs) return "ENDED";
  if (start != null && start > nowMs) return "SCHEDULED";
  if (status === "active" || status === "configured") return "ACTIVE";
  if (status === "configured") return "SCHEDULED";
  return "DRAFT";
}

/**
 * Notification campaigns — preserve delivery truth; map to operator vocabulary
 * without pretending "sent" is ACTIVE exposure.
 */
export type NotificationOperatorView =
  | { kind: "operator"; status: PromotionOperatorStatus }
  | { kind: "delivery"; delivery: "draft" | "scheduled" | "sent" | "cancelled" | "failed" };

export function resolveNotificationOperatorView(row: {
  status?: string | null;
  sentAt?: string | null;
  scheduledAt?: string | null;
}): NotificationOperatorView {
  const status = String(row.status ?? "").trim().toLowerCase();
  if (status === "sent" || row.sentAt) {
    return { kind: "delivery", delivery: "sent" };
  }
  if (status === "cancelled" || status === "canceled") {
    return { kind: "delivery", delivery: "cancelled" };
  }
  if (status === "failed") {
    return { kind: "delivery", delivery: "failed" };
  }
  if (status === "scheduled" || row.scheduledAt) {
    return { kind: "delivery", delivery: "scheduled" };
  }
  if (status === "draft" || !status) {
    return { kind: "delivery", delivery: "draft" };
  }
  return { kind: "delivery", delivery: "draft" };
}

export function notificationDeliveryLabel(
  delivery: Extract<NotificationOperatorView, { kind: "delivery" }>["delivery"],
  lang: PromotionOperatorStatusLabelLang = "ko"
): string {
  const ko = {
    draft: "초안",
    scheduled: "발송 예약",
    sent: "발송됨",
    cancelled: "취소",
    failed: "실패",
  } as const;
  const en = {
    draft: "Draft",
    scheduled: "Scheduled send",
    sent: "Sent",
    cancelled: "Cancelled",
    failed: "Failed",
  } as const;
  return lang === "en" ? en[delivery] : ko[delivery];
}

/**
 * Owner request lifecycle — requested channels ≠ final channels.
 */
export type OwnerRequestOperatorStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "REVISION_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export function resolveOwnerRequestOperatorStatus(
  status: string | null | undefined
): OwnerRequestOperatorStatus {
  const s = String(status ?? "").trim().toLowerCase();
  switch (s) {
    case "draft":
      return "DRAFT";
    case "submitted":
      return "SUBMITTED";
    case "under_review":
      return "UNDER_REVIEW";
    case "revision_required":
      return "REVISION_REQUIRED";
    case "approved":
      return "APPROVED";
    case "rejected":
      return "REJECTED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    default:
      return "DRAFT";
  }
}

export function ownerRequestOperatorStatusLabel(
  status: OwnerRequestOperatorStatus,
  lang: PromotionOperatorStatusLabelLang = "ko"
): string {
  const ko: Record<OwnerRequestOperatorStatus, string> = {
    DRAFT: "초안",
    SUBMITTED: "제출",
    UNDER_REVIEW: "검토 중",
    REVISION_REQUIRED: "수정 요청",
    APPROVED: "승인",
    REJECTED: "거절",
    CANCELLED: "취소",
  };
  const en: Record<OwnerRequestOperatorStatus, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    UNDER_REVIEW: "Under review",
    REVISION_REQUIRED: "Revision required",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
  };
  return lang === "en" ? en[status] : ko[status];
}

/** Canonical schedule display timezone for Admin Promotion surfaces. */
export const PROMOTION_ADMIN_DISPLAY_TIMEZONE = "Asia/Manila" as const;

export function formatPromotionAdminSchedule(
  iso: string | null | undefined,
  lang: PromotionOperatorStatusLabelLang = "ko"
): string {
  if (!iso) return lang === "en" ? "—" : "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso);
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-PH" : "ko-KR", {
      timeZone: PROMOTION_ADMIN_DISPLAY_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

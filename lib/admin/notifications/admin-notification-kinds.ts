/**
 * R13 — ADMIN NOTIFICATION kinds (client-safe constants).
 *
 * Admin-recipient event types are delivered ONLY through `admin_notifications`
 * (lib/admin/notifications/admin-notification-service.ts). They must never appear in the
 * Member notification pipeline (notification_events → member Bell · list · App Icon · push).
 *
 * Note: `domain: "admin"` in the notification event registry is NOT the same thing —
 * support_admin_replied / support_case_resolved are admin-ORIGIN events delivered to MEMBERS.
 */
export const ADMIN_RECIPIENT_NOTIFICATION_TYPES = [
  "support_customer_replied",
  "support_case_assigned",
  "settlement_commission_review",
  "settlement_financial_exception",
  /** ND-2 — 승인 매장 사장님이 주소·위치(lat/lng)를 바꿈 → 관리자 재검증 (매장 상세 「재검증 완료」). */
  "store_core_info_changed",
] as const;

/**
 * Settlement admin alerts — EXCEPTIONS ONLY (docs/store-commission-cash-settlement-ssot.md §알림).
 * Created in SQL (status-transaction trigger / exception scan) through admin_notification_outbox;
 * one outbox row per financial event (source_key UNIQUE). Normal orders never notify admins —
 * they stay visible in the commission ledger.
 */
export const SETTLEMENT_ADMIN_NOTIFICATION_KINDS = ["settlement_commission_review", "settlement_financial_exception"] as const;
export type SettlementAdminNotificationKind = (typeof SETTLEMENT_ADMIN_NOTIFICATION_KINDS)[number];

/** Settlement events that deliberately create NO admin notification (policy table, tested). */
export const SETTLEMENT_SILENT_EVENTS = [
  "order_created",
  "order_accepted",
  "cooking_started_commission_charged",
  "delivery_progress",
  "order_completed",
  "cash_top_up",
  "outstanding_auto_settled",
  "review_decided",
  "order_blocked_by_cash_gate",
] as const;

export function isSettlementAdminNotificationKind(kind: unknown): kind is SettlementAdminNotificationKind {
  return kind === "settlement_commission_review" || kind === "settlement_financial_exception";
}

/**
 * Business (work) state of the linked item — read LIVE from the review queue on every inbox read,
 * never stored on the notification, so the alert and the queue can never disagree.
 * Independent of read state (read_at).
 */
export type AdminNotificationWorkState = "pending" | "done" | "attention";
export type AdminNotificationWorkStatus = { state: AdminNotificationWorkState; labelKo: string; labelEn: string };

export function settlementWorkStatusFromAdjustment(adjustmentStatus: string | null | undefined): AdminNotificationWorkStatus {
  switch (adjustmentStatus) {
    case "review_required":
      return { state: "pending", labelKo: "검토 대기", labelEn: "Awaiting review" };
    case "refunded":
      return { state: "done", labelKo: "환급 승인 완료", labelEn: "Refund approved" };
    case "kept":
      return { state: "done", labelKo: "환급 반려 완료", labelEn: "Refund rejected" };
    default:
      return { state: "done", labelKo: "처리됨", labelEn: "Resolved" };
  }
}

export type AdminRecipientNotificationType = (typeof ADMIN_RECIPIENT_NOTIFICATION_TYPES)[number];

const ADMIN_RECIPIENT_SET: ReadonlySet<string> = new Set(ADMIN_RECIPIENT_NOTIFICATION_TYPES);

export function isAdminRecipientNotificationType(type: unknown): boolean {
  return typeof type === "string" && ADMIN_RECIPIENT_SET.has(type.trim());
}

/** Inbox retention: rows older than this are archived (hidden), never deleted. */
export const ADMIN_NOTIFICATION_RETENTION_DAYS = 90;

export type AdminNotificationSeverity = "info" | "warning" | "critical";

export type AdminNotificationDto = {
  id: string;
  kind: string;
  severity: AdminNotificationSeverity;
  title: string;
  body: string | null;
  linkUrl: string | null;
  workRefTable: string | null;
  workRefId: string | null;
  createdAt: string;
  readAt: string | null;
  /** Settlement alerts only: live work state of the linked item (independent of readAt). */
  workStatus?: AdminNotificationWorkStatus | null;
};

/** Same-tab signal after an admin reads notifications (inbox badge re-read). */
export const ADMIN_INBOX_CHANGED_EVENT = "dibay:admin-inbox-changed";

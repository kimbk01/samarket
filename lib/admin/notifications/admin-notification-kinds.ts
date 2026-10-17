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
] as const;

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
};

/** Same-tab signal after an admin reads notifications (inbox badge re-read). */
export const ADMIN_INBOX_CHANGED_EVENT = "dibay:admin-inbox-changed";

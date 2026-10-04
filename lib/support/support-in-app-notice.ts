/**
 * Phase 3 D1 — in-app notice for Support while the app is open (Owner decision: top banner).
 * Source = the existing `notification_events` INSERT Realtime (NotificationsBadgeRealtimeBridge);
 * no new subscription. Support ≠ Messenger: own store/host, same Sam tokens as the messenger
 * banner. Tap → deliverSupportOpen(source "banner"); the case GET then clears the bell row (A3).
 */
import { parseSupportCaseIdFromPushPath } from "@/lib/support/support-push-modal-entry";
import { getSupportModalState } from "@/lib/support/support-modal-controller";

/** Requester-facing events only (support_customer_replied goes to admins → admin toast). */
export const SUPPORT_IN_APP_NOTICE_TYPES = [
  "support_admin_replied",
  "support_case_resolved",
  "support_case_reopened",
] as const;
export type SupportInAppNoticeType = (typeof SUPPORT_IN_APP_NOTICE_TYPES)[number];

export type SupportInAppNotice = {
  notificationId: string;
  caseId: string;
  type: SupportInAppNoticeType;
  preview: string;
  updatedAt: number;
};

let current: SupportInAppNotice | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getSupportInAppNotice(): SupportInAppNotice | null {
  return current;
}

export function subscribeSupportInAppNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissSupportInAppNotice(): void {
  if (!current) return;
  current = null;
  emit();
}

/**
 * Realtime row (adapted legacy shape: `type`, `link_url`, `id`, `body`) → banner.
 * Returns false (no banner) when the row is not a requester support event, has no case
 * route, or the customer is already looking at that case in the open sheet.
 */
export function pushSupportInAppNoticeFromRealtimeRow(row: Record<string, unknown>): boolean {
  const type = String(row.type ?? row.event_type ?? "").trim();
  if (!(SUPPORT_IN_APP_NOTICE_TYPES as readonly string[]).includes(type)) return false;
  const caseId = parseSupportCaseIdFromPushPath(String(row.link_url ?? ""));
  if (!caseId) return false;
  const modal = getSupportModalState();
  if (modal.phase === "open" && modal.caseId === caseId) return false;
  current = {
    notificationId: String(row.id ?? "").trim(),
    caseId,
    type: type as SupportInAppNoticeType,
    preview: String(row.body ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    updatedAt: Date.now(),
  };
  emit();
  return true;
}

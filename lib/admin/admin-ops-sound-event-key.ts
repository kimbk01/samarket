/**
 * Admin Ops RT sourceTable → notification sound SSOT event_key.
 *
 * Only keys that exist in notification-sound-registry / Admin sound UI.
 * Sources without a distinct UI key intentionally fall back to admin_notice_received.
 */

import { getRegistryEvent } from "@/lib/notifications/notification-sound-registry";

/** Canonical Admin Ops sound fallback — must remain a registered SSOT event. */
export const ADMIN_OPS_SOUND_EVENT_FALLBACK = "admin_notice_received" as const;

const SOURCE_TABLE_TO_EVENT_KEY: Readonly<Record<string, string>> = {
  reports: "admin_report_received",
  store_reports: "admin_report_received",
  community_reports: "admin_report_received",
  point_charge_requests: "settlement_charge_requested",
  store_point_charge_requests: "settlement_charge_requested",
  // No distinct Admin UI event_key today — intentional fallback:
  // stores, feed_ad_requests, member_admin_note_threads, platform_admin_inquiries,
  // delivery_operation_alert_events, meeting_approvals, inquiry_threads, store_orders,
  // support_cases (ARO-OPS-UX-002-B6 — uses admin_notice_received)
};

/**
 * Resolve the SSOT event_key used for Admin Ops in-app sound asset lookup.
 * Does not decide eligibility (P0-D) or mute (P2-A8).
 */
export function resolveAdminOpsSoundEventKey(sourceTable: string): string {
  const table = String(sourceTable ?? "").trim();
  const mapped = table ? SOURCE_TABLE_TO_EVENT_KEY[table] : undefined;
  const key = mapped ?? ADMIN_OPS_SOUND_EVENT_FALLBACK;
  if (!getRegistryEvent(key)) {
    return ADMIN_OPS_SOUND_EVENT_FALLBACK;
  }
  return key;
}

/** Documented intentional fallback sources (no distinct Admin UI event row). */
export const ADMIN_OPS_SOUND_FALLBACK_SOURCES = [
  "stores",
  "feed_ad_requests",
  "member_admin_note_threads",
  "platform_admin_inquiries",
  "delivery_operation_alert_events",
  "meeting_approvals",
  "inquiry_threads",
  "store_orders",
  "support_cases",
] as const;

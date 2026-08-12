/**
 * Admin ops sound classification — GATE 2.
 * Badge/count stays on /api/admin/admin-bell. Sound uses row PK + this class only.
 *
 * DO NOT: treat dashboard KPI refresh as sound. DO NOT ring every pending count.
 */

export type AdminSoundClass = "CRITICAL" | "ACTION_REQUIRED" | "INFORMATIONAL" | "SILENT";

export const ADMIN_SOUND_BURST_WINDOW_MS = 2_500;

const ACTIONABLE_TABLES = new Set([
  "store_point_charge_requests",
  "point_charge_requests",
  "feed_ad_requests",
  "reports",
  "store_reports",
  "store_owner_applications",
  "meeting_approvals",
  "inquiry_threads",
  "store_orders",
]);

export function classifyAdminSoundSource(sourceTable: string): AdminSoundClass {
  const table = sourceTable.trim();
  if (table === "delivery_operation_alert_events") return "CRITICAL";
  if (ACTIONABLE_TABLES.has(table)) return "ACTION_REQUIRED";
  return "INFORMATIONAL";
}

export function isAdminSoundEligible(sourceTable: string): boolean {
  const cls = classifyAdminSoundSource(sourceTable);
  return cls === "CRITICAL" || cls === "ACTION_REQUIRED";
}

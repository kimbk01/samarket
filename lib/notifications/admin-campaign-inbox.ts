/**
 * Admin campaign inbox helpers — notice / system / marketing.
 *
 * LOCK:
 * - Bell digit: persistent notice + system + marketing campaign events are Member A.
 * - UI open-detail: notice + system only (never marketing → detail via this helper).
 * - campaignType in display_payload is SSOT for notice vs system when event.type is shared.
 */
import type { BellPresentationType } from "@/lib/notifications/inbox-events-merge";

export type AdminCampaignType = "notice" | "system" | "marketing";

export type AdminCampaignInboxHints = {
  push_kind?: string | null;
  bell_presentation_type?: BellPresentationType | string | null;
  notification_type?: string | null;
  event_type?: string | null;
  campaign_type?: string | null;
  meta?: Record<string, unknown> | null;
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function resolveAdminCampaignTypeFromPayload(
  displayPayload: unknown
): AdminCampaignType | null {
  if (!displayPayload || typeof displayPayload !== "object") return null;
  const raw = norm((displayPayload as Record<string, unknown>).campaignType);
  if (raw === "notice" || raw === "system" || raw === "marketing") return raw;
  return null;
}

/** Push / inbox push_kind for admin campaigns. */
export function adminCampaignPushKind(campaignType: AdminCampaignType): string {
  if (campaignType === "marketing") return "marketing";
  if (campaignType === "system") return "system";
  return "notice";
}

export function adminCampaignEventClass(campaignType: AdminCampaignType): string {
  if (campaignType === "marketing") return "admin_marketing";
  if (campaignType === "system") return "admin_system";
  return "admin_notice";
}

export function adminCampaignBellPresentation(
  campaignType: AdminCampaignType
): BellPresentationType {
  if (campaignType === "marketing") return "admin_marketing";
  if (campaignType === "system") return "admin_system";
  return "admin_notice";
}

export function resolveAdminCampaignTypeFromInboxHints(
  row: AdminCampaignInboxHints
): AdminCampaignType | null {
  const ct = norm(row.campaign_type);
  if (ct === "notice" || ct === "system" || ct === "marketing") return ct;

  const pk = norm(row.push_kind);
  if (pk === "marketing") return "marketing";
  if (pk === "notice") return "notice";
  if (pk === "system") return "system";

  const bell = norm(row.bell_presentation_type);
  if (bell === "admin_marketing") return "marketing";
  if (bell === "admin_notice") return "notice";
  if (bell === "admin_system") return "system";

  const et = norm(row.event_type);
  if (et === "admin_marketing_banner") return "marketing";
  if (et === "admin_notice") {
    // Legacy rows without campaignType — treat as notice (Bell-included).
    return "notice";
  }

  return null;
}

/** Persistent announcement rows that open `/notifications/[id]`. */
export function isAdminNoticeOrSystemInboxItem(row: AdminCampaignInboxHints): boolean {
  const kind = resolveAdminCampaignTypeFromInboxHints(row);
  return kind === "notice" || kind === "system";
}

export function isAdminMarketingInboxItem(row: AdminCampaignInboxHints): boolean {
  return resolveAdminCampaignTypeFromInboxHints(row) === "marketing";
}

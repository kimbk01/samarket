export const CAMPAIGN_CHANNELS = [
  "push_only",
  "in_app_only",
  "push_and_in_app",
  "test_only",
] as const;

export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "partially_failed",
  "failed",
  "cancelled",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_DELIVERY_CHANNELS = ["push", "in_app"] as const;
export type CampaignDeliveryChannel = (typeof CAMPAIGN_DELIVERY_CHANNELS)[number];

export const CAMPAIGN_DELIVERY_STATUSES = [
  "pending",
  "sent",
  "failed",
  "skipped",
  "opened",
  "dismissed",
] as const;

export type CampaignDeliveryStatus = (typeof CAMPAIGN_DELIVERY_STATUSES)[number];

export type AdminNotificationCampaignRow = {
  id: string;
  type: "notice" | "marketing" | "system";
  target_type: string;
  title: string;
  body: string;
  channel: CampaignChannel;
  target_url: string | null;
  image_url: string | null;
  deeplink_url: string | null;
  web_url: string | null;
  push_image_url: string | null;
  in_app_image_url: string | null;
  priority: "low" | "normal" | "high";
  visibility_policy: "default" | "public" | "private";
  target_payload: Record<string, unknown> | null;
  segment_region_code: string | null;
  send_progress_offset: number | null;
  status: CampaignStatus | string;
  target_count: number | null;
  sent_count: number | null;
  skipped_count: number | null;
  failed_count: number | null;
  send_claimed_at?: string | null;
  send_claim_token?: string | null;
  last_error?: string | null;
  send_idempotency_key?: string | null;
  test_send_idempotency_key?: string | null;
};

export function campaignNeedsInApp(channel: CampaignChannel): boolean {
  return channel === "in_app_only" || channel === "push_and_in_app" || channel === "test_only";
}

export function campaignNeedsPush(channel: CampaignChannel): boolean {
  return channel === "push_only" || channel === "push_and_in_app" || channel === "test_only";
}

export function resolveCampaignRouteUrl(campaign: Pick<AdminNotificationCampaignRow, "deeplink_url" | "web_url" | "target_url">): string {
  const deeplink = campaign.deeplink_url?.trim();
  if (deeplink) return deeplink.startsWith("/") ? deeplink : `/${deeplink}`;
  const web = campaign.web_url?.trim();
  if (web) {
    try {
      const u = new URL(web);
      return u.pathname + u.search + u.hash;
    } catch {
      if (web.startsWith("/")) return web;
    }
  }
  const legacy = campaign.target_url?.trim();
  if (legacy) return legacy.startsWith("/") ? legacy : `/${legacy}`;
  return "/notifications";
}

export function resolveCampaignInAppImageUrl(
  campaign: Pick<AdminNotificationCampaignRow, "in_app_image_url" | "image_url">
): string | null {
  const url = campaign.in_app_image_url?.trim() || campaign.image_url?.trim();
  return url || null;
}

export function resolveCampaignPushImageUrl(
  campaign: Pick<AdminNotificationCampaignRow, "push_image_url" | "image_url">
): string | null {
  const url = campaign.push_image_url?.trim() || campaign.image_url?.trim();
  return url || null;
}

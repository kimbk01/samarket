import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";
import type { CampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { resolveCustomerCenterCampaignContentBind } from "@/lib/notices/customer-center-campaign-bind";

export function buildCampaignContentSnapshot(
  campaign: Pick<
    AdminNotificationCampaignRow,
    | "title"
    | "body"
    | "type"
    | "channel"
    | "target_type"
    | "deeplink_url"
    | "web_url"
    | "push_image_url"
    | "in_app_image_url"
  > & {
    target_payload?: Record<string, unknown> | null;
  },
  opts?: { destinationKind?: CampaignContentSnapshot["destination_kind"] }
): CampaignContentSnapshot {
  const contentId =
    typeof campaign.target_payload?.appNoticeId === "string"
      ? campaign.target_payload.appNoticeId
      : typeof campaign.target_payload?.content_id === "string"
        ? campaign.target_payload.content_id
        : null;
  const bind = resolveCustomerCenterCampaignContentBind({
    contentId,
    contentType:
      typeof campaign.target_payload?.content_type === "string"
        ? campaign.target_payload.content_type
        : campaign.type,
  });

  return {
    title: campaign.title,
    body: campaign.body,
    type: campaign.type,
    channel: campaign.channel,
    target_type: campaign.target_type,
    deeplink_url: campaign.deeplink_url ?? null,
    web_url: campaign.web_url ?? null,
    push_image_url: campaign.push_image_url ?? null,
    in_app_image_url: campaign.in_app_image_url ?? null,
    destination_kind: opts?.destinationKind,
    content_id: bind?.content_id ?? null,
    content_type: bind?.content_type ?? null,
    canonical_route: bind?.canonical_route ?? null,
  };
}

export function campaignRowFromContentSnapshot(
  campaignId: string,
  snapshot: CampaignContentSnapshot
): AdminNotificationCampaignRow {
  const contentId =
    typeof snapshot.content_id === "string" && snapshot.content_id.trim()
      ? snapshot.content_id.trim()
      : null;
  return {
    id: campaignId,
    type: snapshot.type as AdminNotificationCampaignRow["type"],
    target_type: snapshot.target_type,
    title: snapshot.title,
    body: snapshot.body,
    channel: snapshot.channel as AdminNotificationCampaignRow["channel"],
    target_url: snapshot.canonical_route ?? snapshot.deeplink_url,
    image_url: snapshot.in_app_image_url ?? snapshot.push_image_url,
    deeplink_url: snapshot.canonical_route ?? snapshot.deeplink_url,
    web_url: snapshot.web_url,
    push_image_url: snapshot.push_image_url,
    in_app_image_url: snapshot.in_app_image_url,
    priority: "normal",
    visibility_policy: "default",
    target_payload: contentId
      ? {
          appNoticeId: contentId,
          content_id: contentId,
          content_type: snapshot.content_type ?? snapshot.type,
          canonical_route: snapshot.canonical_route ?? null,
        }
      : null,
    segment_region_code: null,
    send_progress_offset: 0,
    status: "draft",
    target_count: 0,
    sent_count: 0,
    skipped_count: 0,
    failed_count: 0,
  };
}

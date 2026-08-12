import type { AdminNotificationCampaignRow } from "@/lib/admin/notification-campaigns/campaign-types";
import type { CampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";

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
  >,
  opts?: { destinationKind?: CampaignContentSnapshot["destination_kind"] }
): CampaignContentSnapshot {
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
  };
}

export function campaignRowFromContentSnapshot(
  campaignId: string,
  snapshot: CampaignContentSnapshot
): AdminNotificationCampaignRow {
  return {
    id: campaignId,
    type: snapshot.type as AdminNotificationCampaignRow["type"],
    target_type: snapshot.target_type,
    title: snapshot.title,
    body: snapshot.body,
    channel: snapshot.channel as AdminNotificationCampaignRow["channel"],
    target_url: snapshot.deeplink_url,
    image_url: snapshot.in_app_image_url ?? snapshot.push_image_url,
    deeplink_url: snapshot.deeplink_url,
    web_url: snapshot.web_url,
    push_image_url: snapshot.push_image_url,
    in_app_image_url: snapshot.in_app_image_url,
    priority: "normal",
    visibility_policy: "default",
    target_payload: null,
    segment_region_code: null,
    send_progress_offset: 0,
    status: "draft",
    target_count: 0,
    sent_count: 0,
    skipped_count: 0,
    failed_count: 0,
  };
}

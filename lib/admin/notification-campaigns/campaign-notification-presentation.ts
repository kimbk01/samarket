import {
  campaignNeedsInApp,
  campaignNeedsPush,
  resolveCampaignInAppImageUrl,
  resolveCampaignPushImageUrl,
  resolveCampaignRouteUrl,
  type AdminNotificationCampaignRow,
  type CampaignChannel,
} from "@/lib/admin/notification-campaigns/campaign-types";
import {
  eventTypeForAdminCampaignType,
  getNotificationEventDefinition,
} from "@/lib/notifications/core/notification-event-registry";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { resolveNotificationSoundForEvent } from "@/lib/notifications/notification-sound-resolver";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { getSiteOrigin } from "@/lib/env/runtime";

export type AdminCampaignPresentationInput = {
  title: string;
  body: string;
  type: AdminNotificationCampaignRow["type"];
  channel: CampaignChannel;
  deeplink_url?: string | null;
  web_url?: string | null;
  target_url?: string | null;
  push_image_url?: string | null;
  in_app_image_url?: string | null;
  image_url?: string | null;
  campaignId?: string | null;
  target_type?: string | null;
};

export type AdminCampaignNotificationPresentation = {
  eventType: NotificationEventType;
  category: string;
  title: string;
  body: string;
  pushImageUrl: string | null;
  inAppImageUrl: string | null;
  routeUrl: string;
  deepLink: string;
  soundPolicyKey: string;
  soundAssetId: string | null;
  bellPolicy: string;
  needsPush: boolean;
  needsInApp: boolean;
  pushPayload: NotificationSideEffectPayloadOut;
  inAppPresentation: {
    title: string;
    body: string;
    imageUrl: string | null;
    routeUrl: string;
  };
  displayPayload: Record<string, unknown>;
};

function asCampaignRow(input: AdminCampaignPresentationInput): AdminNotificationCampaignRow {
  return {
    id: input.campaignId?.trim() || "preview",
    type: input.type,
    target_type: input.target_type ?? "all",
    title: input.title,
    body: input.body,
    channel: input.channel,
    target_url: input.target_url ?? null,
    image_url: input.image_url ?? null,
    deeplink_url: input.deeplink_url ?? null,
    web_url: input.web_url ?? null,
    push_image_url: input.push_image_url ?? null,
    in_app_image_url: input.in_app_image_url ?? null,
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

/**
 * Canonical admin campaign presentation — shared by UI preview, test-send, and sendCampaignToUser.
 */
export function buildAdminCampaignNotificationPresentation(
  input: AdminCampaignPresentationInput,
  opts?: { userId?: string; notificationEventId?: string | null; badgeCount?: number; occurredAt?: string }
): AdminCampaignNotificationPresentation {
  const campaign = asCampaignRow(input);
  const eventType = eventTypeForAdminCampaignType(campaign.type);
  const definition = getNotificationEventDefinition(eventType);
  const category = definition.eventCategory;
  const routeUrl = resolveCampaignRouteUrl(campaign);
  const pushImageUrl = resolveCampaignPushImageUrl(campaign);
  const inAppImageUrl = resolveCampaignInAppImageUrl(campaign);
  const soundPolicyKey = definition.soundEventKey ?? "system_default";
  const soundResolved = resolveNotificationSoundForEvent(soundPolicyKey, { platform: "android" });
  const userId = opts?.userId?.trim() || "preview-user";
  const eventId = opts?.notificationEventId?.trim() || `preview:${campaign.id}`;
  const occurredAt = opts?.occurredAt ?? new Date().toISOString();
  const badgeCount = Math.max(0, Math.floor(Number(opts?.badgeCount) || 0));
  const origin = getSiteOrigin();
  const link = routeUrl.startsWith("/") ? routeUrl : `/${routeUrl}`;

  const displayPayload: Record<string, unknown> = {
    routeUrl: link,
    imageUrl: inAppImageUrl,
    campaignId: campaign.id,
    campaignType: campaign.type,
    targetType: campaign.target_type,
    previewKind: "admin_campaign",
    deeplinkUrl: campaign.deeplink_url,
    webUrl: campaign.web_url,
  };

  const pushPayload: NotificationSideEffectPayloadOut = {
    user_id: userId,
    notification_type: campaign.type === "marketing" ? "marketing" : "notice",
    title: campaign.title,
    body: campaign.body,
    link_url: link,
    link_url_absolute: origin ? `${origin}${link}` : link,
    occurred_at: occurredAt,
    meta: {
      kind: eventType,
      category,
      notification_event_id: eventId,
      notification_id: eventId,
      badge_count: badgeCount,
      campaign_id: campaign.id,
      push_image_url: pushImageUrl,
      display_payload: {
        ...displayPayload,
        imageUrl: pushImageUrl,
      },
      push_kind: campaign.type === "marketing" ? "marketing" : "notice",
      event_key: soundPolicyKey,
      sound_asset_id: soundResolved.assetId,
      android_channel_id: soundResolved.androidChannelId,
      ios_sound_name: soundResolved.iosSoundName,
    },
  };

  return {
    eventType,
    category,
    title: campaign.title,
    body: campaign.body,
    pushImageUrl,
    inAppImageUrl,
    routeUrl: link,
    deepLink: link,
    soundPolicyKey,
    soundAssetId: soundResolved.assetId,
    bellPolicy: definition.bellPolicy,
    needsPush: campaignNeedsPush(campaign.channel),
    needsInApp: campaignNeedsInApp(campaign.channel),
    pushPayload,
    inAppPresentation: {
      title: campaign.title,
      body: campaign.body,
      imageUrl: inAppImageUrl,
      routeUrl: link,
    },
    displayPayload,
  };
}

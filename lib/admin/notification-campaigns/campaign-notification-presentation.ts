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
import { resolveCustomerCenterCampaignContentBind } from "@/lib/notices/customer-center-campaign-bind";

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
  /** Content SSOT id (physical app_notices.id). */
  appNoticeId?: string | null;
  contentType?: string | null;
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
  const appNoticeId = input.appNoticeId?.trim() || null;
  const bind = resolveCustomerCenterCampaignContentBind({
    contentId: appNoticeId,
    contentType: input.contentType ?? input.type,
  });
  // Content-bound campaigns: Push + Bell share canonical board detail.
  const routeUrl = bind
    ? bind.canonical_route
    : resolveCampaignRouteUrl(campaign);
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
    ...(appNoticeId ? { appNoticeId, content_id: appNoticeId } : {}),
    ...(bind
      ? {
          content_type: bind.content_type,
          canonical_route: bind.canonical_route,
        }
      : {}),
  };

  const eventClass =
    campaign.type === "marketing"
      ? "admin_marketing"
      : campaign.type === "system"
        ? "admin_system"
        : "admin_notice";
  const targetTab = campaign.type === "marketing" ? "marketing" : "system";
  const channel = campaign.channel;
  const isPushOnlyMarketing = eventClass === "admin_marketing" && channel === "push_only";
  const pushKind =
    campaign.type === "marketing" ? "marketing" : campaign.type === "system" ? "system" : "notice";
  const pushNotificationType =
    campaign.type === "marketing" ? "marketing" : campaign.type === "system" ? "system" : "notice";

  const pushPayload: NotificationSideEffectPayloadOut = {
    user_id: userId,
    notification_type: pushNotificationType,
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
      push_kind: pushKind,
      event_key: soundPolicyKey,
      sound_asset_id: soundResolved.assetId,
      android_channel_id: soundResolved.androidChannelId,
      ios_sound_name: soundResolved.iosSoundName,
      // P0 additive envelope (flat FCM via buildFcmDataFields)
      schemaVersion: "1",
      eventClass,
      campaignChannel: channel,
      targetKind: isPushOnlyMarketing ? "approved_internal_route" : "notification",
      targetTab: isPushOnlyMarketing ? undefined : targetTab,
      targetNotificationId: isPushOnlyMarketing ? undefined : eventId,
      targetApprovedRoute: isPushOnlyMarketing ? link : undefined,
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

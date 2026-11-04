import {
  campaignNeedsInApp,
  campaignNeedsPush,
  resolveCampaignInAppImageUrl,
  resolveCampaignPushImageUrl,
  resolveCampaignExternalUrl,
  resolveCampaignRouteUrl,
  type AdminNotificationCampaignRow,
  type CampaignChannel,
} from "@/lib/admin/notification-campaigns/campaign-types";
import { appendCampaignPushOpenParam } from "@/lib/notifications/campaign-push-open-param";
import {
  eventTypeForAdminCampaignType,
  getNotificationEventDefinition,
} from "@/lib/notifications/core/notification-event-registry";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { resolveNotificationSoundForEvent } from "@/lib/notifications/notification-sound-resolver";
import { resolveNotificationItem } from "@/lib/notifications/notification-item-registry";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { getSiteOrigin } from "@/lib/env/runtime";
import { resolveCustomerCenterCampaignContentBind } from "@/lib/notices/customer-center-campaign-bind";
import {
  isBareNotificationsCenterHref,
  isNotificationOriginUnavailableFallback,
  PUSH_ONLY_NOTIFICATION_INBOX_HREF,
} from "@/lib/notifications/resolve-notification-inbox-href";

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
  opts?: {
    userId?: string;
    notificationEventId?: string | null;
    /** C2: 저장된 알림 행의 최종 목적지(`display_payload.routeUrl`) — 푸시도 이 값을 그대로 쓴다 */
    finalRouteUrl?: string | null;
    badgeCount?: number;
    occurredAt?: string;
    /** 발송 회차 — 푸시 전용 실발송은 목적지에 실어 열람을 기록한다(campaign-push-open-param). */
    occurrenceId?: string | null;
  }
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
  // ADM-01: allowlisted external link is shown on the notification detail, never routed in-app.
  const externalUrl = bind ? null : resolveCampaignExternalUrl(campaign);
  const pushImageUrl = resolveCampaignPushImageUrl(campaign);
  const inAppImageUrl = resolveCampaignInAppImageUrl(campaign);
  // 알림 항목 SSOT (Owner 승인 2026-11-02): 공지·시스템·마케팅 캠페인은 각자 항목의 소리 키(앱 안 행과 같은 판정).
  const campaignItem = resolveNotificationItem({
    eventType,
    campaignType: campaign.type,
    previewKind: "admin_campaign",
  });
  const soundPolicyKey = campaignItem?.soundEventKey ?? definition.soundEventKey ?? "system_default";
  const soundResolved = resolveNotificationSoundForEvent(soundPolicyKey, { platform: "android" });
  const userId = opts?.userId?.trim() || "preview-user";
  /** 실제 앱 안 알림 행 id — 없으면(push_only 실발송) 상세 주소·알림 id 를 만들지 않는다. */
  const realEventId = opts?.notificationEventId?.trim() || null;
  const isPreview = !opts?.userId?.trim();
  const eventId = realEventId || `preview:${campaign.id}`;
  const wireEventId = realEventId ?? (isPreview ? eventId : undefined);
  const occurredAt = opts?.occurredAt ?? new Date().toISOString();
  // 확정 설계 B-8 — 배지 숫자를 모르면(계산 실패) 싣지 않는다. 0 을 실으면 iPhone 앱 아이콘 숫자가 지워진다.
  const badgeCount =
    opts?.badgeCount == null || !Number.isFinite(Number(opts.badgeCount))
      ? null
      : Math.max(0, Math.floor(Number(opts.badgeCount)));
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
    ...(externalUrl ? { externalUrl } : {}),
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
  const targetTab =
    campaign.type === "marketing"
      ? "marketing"
      : campaign.type === "system"
        ? "system"
        : "notice";
  const channel = campaign.channel;
  const hasCanonicalOriginalRoute =
    !isBareNotificationsCenterHref(link) && !isNotificationOriginUnavailableFallback(link);
  /**
   * C2 목적지 계약 (notification-system-ssot-hardlock-reaudit-2026-11-01 §3 C2):
   * - 앱 안 알림 행 있음(실발송): 푸시 목적지 = 저장된 최종 목적지. **봉투(schemaVersion·eventClass)를 싣지 않는다** —
   *   Android 2026-08-03 이후 빌드는 봉투가 있으면 url 을 버리고 다시 계산했다(시스템 캠페인 → 목록, build ≤24).
   *   봉투가 없으면 모든 빌드가 url 을 그대로 쓴다. 앱 실행 중 시스템 알림도 다른 알림처럼 생략(웹 배너·소리 1회).
   * - 행 없음(push_only 실발송): 지정 목적지, 없으면 알림센터 + 「보관되지 않는 푸시」 안내. 앱 실행 중에도 알릴
   *   곳이 시스템 알림뿐이라 봉투 유지(승인 경로 = 같은 목적지).
   * - 관리자 미리보기: 기존 그대로.
   */
  const hasInboxRow = Boolean(realEventId);
  const pushRouteBase = hasInboxRow
    ? opts?.finalRouteUrl?.trim() ||
      (hasCanonicalOriginalRoute ? link : `/notifications/${encodeURIComponent(realEventId!)}`)
    : isPreview || hasCanonicalOriginalRoute
      ? link
      : PUSH_ONLY_NOTIFICATION_INBOX_HREF;
  // 푸시 전용 실발송: 알림 id 가 없어 열람을 기록할 수 없던 것 → 목적지에 회차 id (Owner 승인 2026-11-02).
  const pushRoute =
    !hasInboxRow && !isPreview && opts?.occurrenceId
      ? appendCampaignPushOpenParam(pushRouteBase, opts.occurrenceId)
      : pushRouteBase;
  const envelope: Record<string, unknown> = hasInboxRow
    ? {}
    : {
        schemaVersion: "1",
        eventClass,
        campaignChannel: channel,
        targetKind: isPreview && !hasCanonicalOriginalRoute ? "notification" : "approved_internal_route",
        targetTab,
        targetNotificationId: isPreview ? wireEventId : undefined,
        targetApprovedRoute: isPreview && !hasCanonicalOriginalRoute ? undefined : pushRoute,
      };
  const pushKind = campaignPushKind(campaign.type);
  const pushNotificationType = pushKind;

  const pushPayload: NotificationSideEffectPayloadOut = {
    user_id: userId,
    notification_type: pushNotificationType,
    title: campaign.title,
    body: campaign.body,
    link_url: pushRoute,
    link_url_absolute: origin ? `${origin}${pushRoute}` : pushRoute,
    occurred_at: occurredAt,
    meta: {
      kind: eventType,
      /**
       * 수신 설정 판정이 이 값을 먼저 읽는다(`resolveWebPushPreferenceEventType`). 없으면 공지(type notice)가
       * notification_type "notice" → 알 수 없는 종류 → 안전 대체 「주문 알림」 설정으로 걸러졌다(재감사 C-1).
       */
      event_type: eventType,
      category,
      notification_event_id: wireEventId,
      notification_id: wireEventId,
      ...(badgeCount != null ? { badge_count: badgeCount } : {}),
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
      // P0 envelope — push_only·미리보기만 (위 C2 설명)
      ...envelope,
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

/** 운영자 알림 푸시의 종류 값 — 발송 묶음과 수신 설정 판정(미리보기)이 같은 값을 쓴다. */
export function campaignPushKind(type: AdminNotificationCampaignRow["type"]): "marketing" | "system" | "notice" {
  return type === "marketing" ? "marketing" : type === "system" ? "system" : "notice";
}

/**
 * 수신 설정 판정에 들어가는 최소 묶음 — 실제 발송 묶음(`pushPayload`)과 같은
 * notification_type · meta.kind · meta.event_type · meta.push_kind 를 쓴다 (재감사 C-2 · 미리보기 = 발송).
 */
export function campaignPushPreferenceProbe(
  type: AdminNotificationCampaignRow["type"],
  userId: string
): NotificationSideEffectPayloadOut {
  const eventType = eventTypeForAdminCampaignType(type);
  const pushKind = campaignPushKind(type);
  return {
    user_id: userId,
    notification_type: pushKind,
    title: "",
    body: "",
    link_url_absolute: null,
    occurred_at: new Date(0).toISOString(),
    meta: { kind: eventType, event_type: eventType, push_kind: pushKind },
  };
}

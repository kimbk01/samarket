import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertCampaignTargetRows } from "@/lib/admin/notification-campaigns/campaign-target-rows";
import {
  evaluateCampaignPushGate,
  loadCampaignPreferenceSnapshots,
} from "@/lib/admin/notification-campaigns/campaign-eligibility";
import { recordCampaignDelivery } from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import type { CampaignSkipReason } from "@/lib/admin/notification-campaigns/campaign-skip-reasons";
import { buildAdminCampaignNotificationPresentation } from "@/lib/admin/notification-campaigns/campaign-notification-presentation";
import {
  campaignNeedsInApp,
  campaignNeedsPush,
  type AdminNotificationCampaignRow,
  type CampaignChannel,
} from "@/lib/admin/notification-campaigns/campaign-types";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import type { NotificationEventCategory } from "@/lib/notifications/core/notification-event-types";
import { loadActivePushTargets } from "@/lib/push/dispatch/load-active-push-targets";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { withPushSoundMode } from "@/lib/push/dispatch/push-sound-mode";
import { fetchDomainBadgeAuthorityPayload } from "@/lib/notifications/pipeline/notify-badge-service";
import { resolveMemberAppIconTotalForNativeFcm } from "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority";

export type CampaignUserSendResult = {
  ok: boolean;
  sent: boolean;
  skipped: boolean;
  failed: boolean;
  skipReason: CampaignSkipReason | string | null;
  notificationEventId: string | null;
};

async function recordUserTargetStatus(
  svc: SupabaseClient,
  campaign: AdminNotificationCampaignRow,
  occurrenceId: string,
  userId: string,
  status: "sent" | "skipped" | "failed",
  opts?: { skipReason?: string | null; notificationEventId?: string | null; sentAt?: string }
): Promise<void> {
  const patch = {
    status,
    failure_reason: status === "skipped" || status === "failed" ? opts?.skipReason ?? null : null,
    skip_reason: opts?.skipReason ?? null,
    notification_event_id: opts?.notificationEventId ?? null,
    sent_at: status === "sent" ? opts?.sentAt ?? new Date().toISOString() : null,
    occurrence_id: occurrenceId,
  };
  // 확정 설계 B-9 — 대상 기록 실패를 숨기지 않는다(숨기면 같은 대기 행을 매 배치 다시 읽음). 호출한 배치가 실패로 본다.
  const { error } = await upsertCampaignTargetRows(svc, [{ campaign_id: campaign.id, user_id: userId, ...patch }]);
  if (error) throw new Error(`campaign_target_write_failed:${error.message ?? "unknown"}`);
}

async function marketingCampaignConsentSkipReason(
  svc: SupabaseClient,
  userId: string
): Promise<CampaignSkipReason | null> {
  try {
    const snapshots = await loadCampaignPreferenceSnapshots(svc, [userId]);
    return snapshots.get(userId)?.member?.marketingEnabled === true ? null : "marketing_not_opted_in";
  } catch {
    return "policy_filtered";
  }
}

function storedRouteUrl(displayPayload: unknown): string | null {
  if (!displayPayload || typeof displayPayload !== "object") return null;
  const v = (displayPayload as { routeUrl?: unknown }).routeUrl;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Send campaign to one user — channel-aware in-app + push with delivery SSOT.
 * Presentation comes from buildAdminCampaignNotificationPresentation (preview SSOT).
 */
export async function sendCampaignToUser(
  svc: SupabaseClient,
  campaign: AdminNotificationCampaignRow,
  occurrenceId: string,
  userId: string,
  opts?: { forceChannel?: CampaignChannel; skipDuplicateCheck?: boolean; dedupeScope?: "campaign" | "occurrence" }
): Promise<CampaignUserSendResult> {
  const channel = opts?.forceChannel ?? campaign.channel;
  const presentation = buildAdminCampaignNotificationPresentation({
    title: campaign.title,
    body: campaign.body,
    type: campaign.type,
    channel,
    deeplink_url: campaign.deeplink_url,
    web_url: campaign.web_url,
    target_url: campaign.target_url,
    push_image_url: campaign.push_image_url,
    in_app_image_url: campaign.in_app_image_url,
    image_url: campaign.image_url,
    campaignId: campaign.id,
    target_type: campaign.target_type,
    appNoticeId:
      typeof campaign.target_payload?.appNoticeId === "string"
        ? campaign.target_payload.appNoticeId
        : typeof campaign.target_payload?.content_id === "string"
          ? campaign.target_payload.content_id
          : null,
    contentType:
      typeof campaign.target_payload?.content_type === "string"
        ? campaign.target_payload.content_type
        : campaign.type,
  });
  const routeUrl = presentation.routeUrl;
  const inAppImageUrl = presentation.inAppImageUrl;
  const pushImageUrl = presentation.pushImageUrl;
  const now = new Date().toISOString();

  if (channel === "test_only" && !opts?.forceChannel) {
    await recordUserTargetStatus(svc, campaign, occurrenceId, userId, "skipped", {
      skipReason: "test_only_channel",
    });
    await recordCampaignDelivery(svc, {
      campaignId: campaign.id,
      occurrenceId,
      userId,
      channel: "in_app",
      status: "skipped",
      skipReason: "test_only_channel",
    });
    return { ok: true, sent: false, skipped: true, failed: false, skipReason: "test_only_channel", notificationEventId: null };
  }

  const eventType = presentation.eventType;
  const category = presentation.category as NotificationEventCategory;

  let notificationEventId: string | null = null;
  /** C2: 저장된 알림 행의 최종 목적지 — 푸시가 같은 값을 쓴다 */
  let finalRouteUrl: string | null = null;
  let inAppSent = false;
  let pushAttempted = false;
  let anyPushSent = false;
  let lastSkipReason: CampaignSkipReason | string | null = null;

  // U1-B: recurring occurrences are deduped per occurrence; other modes keep the existing key.
  const inAppDedupeKey = opts?.skipDuplicateCheck
    ? `admin_campaign:${campaign.id}:${userId}:${Date.now()}`
    : opts?.dedupeScope === "occurrence"
      ? `admin_campaign:${campaign.id}:${occurrenceId}:${userId}`
      : `admin_campaign:${campaign.id}:${userId}`;

  // 광고성(마케팅) 캠페인 = 직접 동의 회원만 알림함·푸시 모두 (Owner 2026-11-05). 설정을 못 읽으면 보내지 않는다.
  // 공지·시스템 캠페인과 일반 알림함 생성 규칙은 그대로.
  if (campaign.type === "marketing") {
    const consentSkip = await marketingCampaignConsentSkipReason(svc, userId);
    if (consentSkip) {
      for (const ch of ["in_app", "push"] as const) {
        if (ch === "in_app" ? !campaignNeedsInApp(channel) : !campaignNeedsPush(channel)) continue;
        await recordCampaignDelivery(svc, {
          campaignId: campaign.id,
          occurrenceId,
          userId,
          channel: ch,
          status: "skipped",
          skipReason: consentSkip,
        });
      }
      await recordUserTargetStatus(svc, campaign, occurrenceId, userId, "skipped", { skipReason: consentSkip });
      return { ok: true, sent: false, skipped: true, failed: false, skipReason: consentSkip, notificationEventId: null };
    }
  }

  if (campaignNeedsInApp(channel)) {
    const created = await createNotificationEvent(svc, {
      userId,
      type: eventType,
      category,
      title: presentation.title,
      body: presentation.body,
      dedupeKey: inAppDedupeKey,
      displayPayload: {
        ...presentation.displayPayload,
        imageUrl: inAppImageUrl,
        routeUrl,
      },
      unread: true,
    });

    if (!created.ok) {
      if (created.duplicate) {
        lastSkipReason = "duplicate_campaign_user";
        // U1-B: reuse the existing event id so push delivery dedupe (notification_event_id, device_id)
        // blocks re-sending to devices already attempted.
        const { data: existingEvent } = await svc
          .from("notification_events")
          .select("id, display_payload")
          .eq("user_id", userId)
          .eq("dedupe_key", inAppDedupeKey)
          .maybeSingle();
        notificationEventId = existingEvent?.id ? String((existingEvent as { id: string }).id) : null;
        finalRouteUrl = storedRouteUrl((existingEvent as { display_payload?: unknown } | null)?.display_payload);
        await recordCampaignDelivery(svc, {
          campaignId: campaign.id,
          occurrenceId,
          userId,
          channel: "in_app",
          status: "skipped",
          skipReason: "duplicate_campaign_user",
        });
      } else {
        lastSkipReason = "event_insert_or_dispatch_failed";
        await recordCampaignDelivery(svc, {
          campaignId: campaign.id,
          occurrenceId,
          userId,
          channel: "in_app",
          status: "failed",
          skipReason: "event_insert_or_dispatch_failed",
        });
        await recordUserTargetStatus(svc, campaign, occurrenceId, userId, "failed", {
          skipReason: created.error,
        });
        return {
          ok: false,
          sent: false,
          skipped: false,
          failed: true,
          skipReason: created.error,
          notificationEventId: null,
        };
      }
    } else {
      notificationEventId = created.row.id;
      finalRouteUrl = storedRouteUrl(created.row.display_payload);
      inAppSent = true;
      await recordCampaignDelivery(svc, {
        campaignId: campaign.id,
        occurrenceId,
        userId,
        notificationEventId,
        channel: "in_app",
        status: "sent",
        sentAt: now,
      });
    }
  }

  /**
   * 푸시는 대상 회원의 모든 활성 기기로 보낸다 (Owner 2026-11-03 재감사 B-1).
   * 앱이 화면에 보이면 기기가 OS 알림을 숨기고 앱 안 배너만 보인다 — Android
   * `DibayFirebaseMessagingService`(appVisible + 알림함 행 있는 운영자 알림 → 표시 안 함),
   * iPhone 푸시 플러그인 앞 화면 표시 옵션 없음(`[]`). 서버는 「앱 사용 중」을 판정하지 않는다
   * (메신저 화면 신호만 있어 메신저 밖에선 늘 틀렸고, 앱을 막 닫은 회원에게 푸시를 빠뜨렸다).
   */
  if (campaignNeedsPush(channel)) {
    const targets = await loadActivePushTargets(svc, userId, {
      // Capacitor member apps register as production. Local/preview admin servers
      // must still address those devices — otherwise push is skipped as token_missing.
      environment: "production",
      fcmMode: "multi_device_fcm",
    });
    if (!targets.length) {
      lastSkipReason = "token_missing";
      await recordCampaignDelivery(svc, {
        campaignId: campaign.id,
        occurrenceId,
        userId,
        notificationEventId,
        channel: "push",
        status: "skipped",
        skipReason: "token_missing",
      });
    } else {
      // (R-4 2026-11-03) 기기 알림 권한 「꺼짐」 분기 삭제 — 그 값을 쓰는 앱 코드가 없고, 「건너뜀」 기록 뒤에도
      // dispatchPushForUser 가 그 기기로 실제 발송해 기록이 실제와 어긋났다. 사유 라벨은 예전 기록 표시용으로 남긴다.
      const buildPushPayload = (badgeCount: number | undefined) =>
        buildAdminCampaignNotificationPresentation(
        {
          title: campaign.title,
          body: campaign.body,
          type: campaign.type,
          channel,
          deeplink_url: campaign.deeplink_url,
          web_url: campaign.web_url,
          target_url: campaign.target_url,
          push_image_url: campaign.push_image_url,
          in_app_image_url: campaign.in_app_image_url,
          image_url: campaign.image_url,
          campaignId: campaign.id,
          target_type: campaign.target_type,
          appNoticeId:
            typeof campaign.target_payload?.appNoticeId === "string"
              ? campaign.target_payload.appNoticeId
              : typeof campaign.target_payload?.content_id === "string"
                ? campaign.target_payload.content_id
                : null,
          contentType:
            typeof campaign.target_payload?.content_type === "string"
              ? campaign.target_payload.content_type
              : campaign.type,
        },
        {
          userId,
          notificationEventId,
          finalRouteUrl,
          badgeCount,
          occurredAt: now,
          occurrenceId,
        }
      ).pushPayload;

      // 확정 설계 B-8 — 수신 설정 판정(게이트)을 먼저: 막힌 회원에게 배지 계산(조회 6번)을 하지 않는다.
      const gate = await evaluateCampaignPushGate(svc, userId, buildPushPayload(undefined), campaign.type);
      if (!gate.allowed) {
        lastSkipReason = gate.skipReason ?? "user_setting_blocked";
        await recordCampaignDelivery(svc, {
          campaignId: campaign.id,
          occurrenceId,
          userId,
          notificationEventId,
          channel: "push",
          status: "skipped",
          skipReason: gate.skipReason,
        });
      } else {
        pushAttempted = true;
        // 배지 계산 실패 → 숫자를 싣지 않음(기기 숫자 유지). 0 으로 보내지 않는다.
        const domain = await fetchDomainBadgeAuthorityPayload(svc, userId, { force: true }).catch(() => null);
        const badgeCount = domain
          ? resolveMemberAppIconTotalForNativeFcm({
              memberAppIconWebTotal: domain.memberAppIconWebTotal,
              appIconTotal: domain.projection?.appIconTotal,
            })
          : undefined;
        const pushPayload = buildPushPayload(badgeCount);
        const pushResult = await dispatchPushForUser(withPushSoundMode(pushPayload, gate.soundMode ?? null), {
          target_type: "admin_campaign",
          target_id: campaign.id,
          skip_settings_gate: true,
          notification_event_id: notificationEventId ?? undefined,
          push_environment: "production",
        });

        for (const delivery of pushResult.deliveries) {
          const deviceId = delivery.device_id;
          const skipReason =
            delivery.status === "skipped"
              ? String(delivery.provider_response?.reason ?? "skipped")
              : null;
          await recordCampaignDelivery(svc, {
            campaignId: campaign.id,
            occurrenceId,
            userId,
            deviceId,
            notificationEventId,
            channel: "push",
            status: delivery.status === "sent" ? "sent" : delivery.status === "failed" ? "failed" : "skipped",
            skipReason,
            providerMessageId:
              typeof delivery.provider_response?.message_id === "string"
                ? delivery.provider_response.message_id
                : null,
            sentAt: delivery.status === "sent" ? now : null,
          });
          if (delivery.status === "sent") anyPushSent = true;
          if (delivery.status === "failed") {
            lastSkipReason =
              typeof delivery.provider_response?.error === "string"
                ? delivery.provider_response.error
                : "push_failed";
          }
          if (delivery.status === "skipped" && skipReason) lastSkipReason = skipReason;
        }

        if (!pushResult.deliveries.length) {
          // 발송 스위치 꺼짐·서버 설정 오류·기기 없음은 다른 원인 — dispatch 사유를 그대로 기록 (확정 설계 B-5).
          const emptyReason = pushResult.skipped_reason?.trim() || "token_missing";
          lastSkipReason = emptyReason;
          await recordCampaignDelivery(svc, {
            campaignId: campaign.id,
            occurrenceId,
            userId,
            notificationEventId,
            channel: "push",
            status: "skipped",
            skipReason: emptyReason,
          });
        }
      }
    }
  }

  const sent = inAppSent || anyPushSent;
  if (sent) {
    await recordUserTargetStatus(svc, campaign, occurrenceId, userId, "sent", {
      notificationEventId,
      sentAt: now,
    });
    return { ok: true, sent: true, skipped: false, failed: false, skipReason: null, notificationEventId };
  }

  if (lastSkipReason) {
    await recordUserTargetStatus(svc, campaign, occurrenceId, userId, "skipped", {
      skipReason: String(lastSkipReason),
      notificationEventId,
    });
    return {
      ok: true,
      sent: false,
      skipped: true,
      failed: false,
      skipReason: lastSkipReason,
      notificationEventId,
    };
  }

  if (pushAttempted) {
    await recordUserTargetStatus(svc, campaign, occurrenceId, userId, "failed", {
      skipReason: "push_failed",
      notificationEventId,
    });
    return {
      ok: false,
      sent: false,
      skipped: false,
      failed: true,
      skipReason: "push_failed",
      notificationEventId,
    };
  }

  await recordUserTargetStatus(svc, campaign, occurrenceId, userId, "skipped", {
    skipReason: "no_channel_action",
    notificationEventId,
  });
  return {
    ok: true,
    sent: false,
    skipped: true,
    failed: false,
    skipReason: "no_channel_action",
    notificationEventId,
  };
}

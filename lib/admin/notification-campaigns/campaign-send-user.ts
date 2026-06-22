import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateCampaignPushGate,
  type SettingsMaps,
} from "@/lib/admin/notification-campaigns/campaign-eligibility";
import { recordCampaignDelivery } from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { resolveCampaignUserAppState } from "@/lib/admin/notification-campaigns/campaign-presence";
import type { CampaignSkipReason } from "@/lib/admin/notification-campaigns/campaign-skip-reasons";
import {
  campaignNeedsInApp,
  campaignNeedsPush,
  resolveCampaignInAppImageUrl,
  resolveCampaignPushImageUrl,
  resolveCampaignRouteUrl,
  type AdminNotificationCampaignRow,
  type CampaignChannel,
} from "@/lib/admin/notification-campaigns/campaign-types";
import type {
  NotificationEventCategory,
  NotificationEventType,
} from "@/lib/notifications/core/notification-event-types";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import {
  resolveNotificationPolicyProfile,
  shouldUseOsNotificationForState,
} from "@/lib/notifications/policy/notification-policy-profiles";
import { loadActivePushTargets } from "@/lib/push/dispatch/load-active-push-targets";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { fetchNotificationBadgeCount } from "@/lib/notifications/pipeline/notify-badge-service";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { getSiteOrigin } from "@/lib/env/runtime";

function campaignEventType(campaignType: AdminNotificationCampaignRow["type"]): NotificationEventType {
  return campaignType === "marketing" ? "admin_marketing_banner" : "admin_notice";
}

function campaignCategory(campaignType: AdminNotificationCampaignRow["type"]): NotificationEventCategory {
  return campaignType === "marketing" ? "admin_marketing_banner" : "admin_notice";
}

function buildCampaignPushPayload(
  row: { id: string; user_id: string; title: string; body: string; created_at: string; category: string; type: string },
  campaign: AdminNotificationCampaignRow,
  routeUrl: string,
  pushImageUrl: string | null,
  badgeCount: number
): NotificationSideEffectPayloadOut {
  const origin = getSiteOrigin();
  const link = routeUrl.startsWith("/") ? routeUrl : `/${routeUrl}`;
  return {
    user_id: row.user_id,
    notification_type: campaign.type === "marketing" ? "marketing" : "notice",
    title: row.title,
    body: row.body,
    link_url: link,
    link_url_absolute: origin ? `${origin}${link}` : link,
    occurred_at: row.created_at,
    meta: {
      kind: row.type,
      category: row.category,
      notification_event_id: row.id,
      notification_id: row.id,
      badge_count: badgeCount,
      campaign_id: campaign.id,
      push_image_url: pushImageUrl,
      display_payload: {
        routeUrl: link,
        imageUrl: pushImageUrl,
        campaignId: campaign.id,
        campaignType: campaign.type,
        previewKind: "admin_campaign",
      },
      push_kind: campaign.type === "marketing" ? "marketing" : "notice",
    },
  };
}

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
  };
  await svc.from("admin_notification_campaign_targets").upsert(
    {
      campaign_id: campaign.id,
      user_id: userId,
      ...patch,
    },
    { onConflict: "campaign_id,user_id" }
  );
}

/**
 * Send campaign to one user — channel-aware in-app + push with delivery SSOT.
 */
export async function sendCampaignToUser(
  svc: SupabaseClient,
  campaign: AdminNotificationCampaignRow,
  userId: string,
  maps: SettingsMaps,
  opts?: { forceChannel?: CampaignChannel; skipDuplicateCheck?: boolean }
): Promise<CampaignUserSendResult> {
  const channel = opts?.forceChannel ?? campaign.channel;
  const routeUrl = resolveCampaignRouteUrl(campaign);
  const inAppImageUrl = resolveCampaignInAppImageUrl(campaign);
  const pushImageUrl = resolveCampaignPushImageUrl(campaign);
  const now = new Date().toISOString();

  if (channel === "test_only" && !opts?.forceChannel) {
    await recordUserTargetStatus(svc, campaign, userId, "skipped", {
      skipReason: "test_only_channel",
    });
    await recordCampaignDelivery(svc, {
      campaignId: campaign.id,
      userId,
      channel: "in_app",
      status: "skipped",
      skipReason: "test_only_channel",
    });
    return { ok: true, sent: false, skipped: true, failed: false, skipReason: "test_only_channel", notificationEventId: null };
  }

  const appState = await resolveCampaignUserAppState(svc, userId);
  const eventType = campaignEventType(campaign.type);
  const category = campaignCategory(campaign.type);
  const profile = resolveNotificationPolicyProfile(category);
  const shouldOsPush = shouldUseOsNotificationForState(profile, appState);

  let notificationEventId: string | null = null;
  let inAppSent = false;
  let pushAttempted = false;
  let anyPushSent = false;
  let lastSkipReason: CampaignSkipReason | string | null = null;

  if (campaignNeedsInApp(channel)) {
    const created = await createNotificationEvent(svc, {
      userId,
      type: eventType,
      category,
      title: campaign.title,
      body: campaign.body,
      dedupeKey: opts?.skipDuplicateCheck
        ? `admin_campaign:${campaign.id}:${userId}:${Date.now()}`
        : `admin_campaign:${campaign.id}:${userId}`,
      displayPayload: {
        routeUrl,
        imageUrl: inAppImageUrl,
        campaignId: campaign.id,
        campaignType: campaign.type,
        targetType: campaign.target_type,
        previewKind: "admin_campaign",
        deeplinkUrl: campaign.deeplink_url,
        webUrl: campaign.web_url,
      },
      unread: true,
    });

    if (!created.ok) {
      if (created.duplicate) {
        lastSkipReason = "duplicate_campaign_user";
        await recordCampaignDelivery(svc, {
          campaignId: campaign.id,
          userId,
          channel: "in_app",
          status: "skipped",
          skipReason: "duplicate_campaign_user",
        });
      } else {
        lastSkipReason = "event_insert_or_dispatch_failed";
        await recordCampaignDelivery(svc, {
          campaignId: campaign.id,
          userId,
          channel: "in_app",
          status: "failed",
          skipReason: "event_insert_or_dispatch_failed",
        });
        await recordUserTargetStatus(svc, campaign, userId, "failed", {
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
      inAppSent = true;
      await recordCampaignDelivery(svc, {
        campaignId: campaign.id,
        userId,
        notificationEventId,
        channel: "in_app",
        status: "sent",
        sentAt: now,
      });
    }
  }

  if (campaignNeedsPush(channel)) {
    if (!shouldOsPush) {
      lastSkipReason = "foreground_no_os_push";
      await recordCampaignDelivery(svc, {
        campaignId: campaign.id,
        userId,
        notificationEventId,
        channel: "push",
        status: "skipped",
        skipReason: "foreground_no_os_push",
      });
      if (channel === "push_only" && !inAppSent) {
        await recordUserTargetStatus(svc, campaign, userId, "skipped", {
          skipReason: "foreground_no_os_push",
        });
        return {
          ok: true,
          sent: false,
          skipped: true,
          failed: false,
          skipReason: "foreground_no_os_push",
          notificationEventId,
        };
      }
    } else {
      const targets = await loadActivePushTargets(svc, userId);
      if (!targets.length) {
        lastSkipReason = "token_missing";
        await recordCampaignDelivery(svc, {
          campaignId: campaign.id,
          userId,
          notificationEventId,
          channel: "push",
          status: "skipped",
          skipReason: "token_missing",
        });
      } else {
        const { data: devices } = await svc
          .from("user_devices")
          .select("id, notification_permission_status, push_provider, platform")
          .eq("user_id", userId)
          .eq("is_active", true);

        for (const dev of devices ?? []) {
          const deviceRow = dev as {
            id: string;
            notification_permission_status?: string | null;
            push_provider?: string | null;
            platform?: string | null;
          };
          if (deviceRow.notification_permission_status === "denied") {
            await recordCampaignDelivery(svc, {
              campaignId: campaign.id,
              userId,
              deviceId: deviceRow.id,
              notificationEventId,
              channel: "push",
              status: "skipped",
              skipReason: "permission_denied",
            });
            lastSkipReason = "permission_denied";
            continue;
          }
        }

        const eventRow =
          notificationEventId != null
            ? { id: notificationEventId, user_id: userId, title: campaign.title, body: campaign.body, created_at: now, category, type: eventType }
            : {
                id: `campaign-push-${campaign.id}-${userId}`,
                user_id: userId,
                title: campaign.title,
                body: campaign.body,
                created_at: now,
                category,
                type: eventType,
              };

        const badgeSnap = await fetchNotificationBadgeCount(svc, userId).catch(() => null);
        const badgeCount = badgeSnap?.total ?? 0;
        const pushPayload = buildCampaignPushPayload(eventRow, campaign, routeUrl, pushImageUrl, badgeCount);

        const gate = await evaluateCampaignPushGate(svc, userId, pushPayload);
        if (!gate.allowed) {
          lastSkipReason = gate.skipReason ?? "user_setting_blocked";
          await recordCampaignDelivery(svc, {
            campaignId: campaign.id,
            userId,
            notificationEventId,
            channel: "push",
            status: "skipped",
            skipReason: gate.skipReason,
          });
        } else {
          pushAttempted = true;
          const pushResult = await dispatchPushForUser(pushPayload, {
            target_type: "admin_campaign",
            target_id: campaign.id,
            skip_settings_gate: true,
          });

          for (const delivery of pushResult.deliveries) {
            const deviceId = delivery.device_id;
            const skipReason =
              delivery.status === "skipped"
                ? String(delivery.provider_response?.reason ?? "skipped")
                : null;
            await recordCampaignDelivery(svc, {
              campaignId: campaign.id,
              userId,
              deviceId,
              notificationEventId,
              channel: "push",
              status: delivery.status === "sent" ? "sent" : delivery.status === "failed" ? "failed" : "skipped",
              skipReason: skipReason as CampaignSkipReason | string | null,
              providerMessageId:
                typeof delivery.provider_response?.providerMessageId === "string"
                  ? delivery.provider_response.providerMessageId
                  : typeof delivery.provider_response?.message_id === "string"
                    ? delivery.provider_response.message_id
                    : null,
              sentAt: delivery.status === "sent" ? now : null,
            });
            if (delivery.status === "sent") anyPushSent = true;
          }

          if (!anyPushSent && pushResult.skipped_reason) {
            lastSkipReason = pushResult.skipped_reason;
          }
        }
      }
    }
  }

  const effectiveSent = inAppSent || anyPushSent;
  const effectiveSkipped = !effectiveSent && !pushAttempted && lastSkipReason != null;
  const effectiveFailed = !effectiveSent && pushAttempted && !anyPushSent && !inAppSent;

  if (effectiveSent) {
    await recordUserTargetStatus(svc, campaign, userId, "sent", {
      notificationEventId,
      sentAt: now,
    });
    return {
      ok: true,
      sent: true,
      skipped: false,
      failed: false,
      skipReason: null,
      notificationEventId,
    };
  }

  if (effectiveSkipped || lastSkipReason === "duplicate_campaign_user") {
    await recordUserTargetStatus(svc, campaign, userId, "skipped", {
      skipReason: lastSkipReason,
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

  await recordUserTargetStatus(svc, campaign, userId, "failed", { skipReason: lastSkipReason });
  return {
    ok: false,
    sent: false,
    skipped: false,
    failed: true,
    skipReason: lastSkipReason,
    notificationEventId,
  };
}

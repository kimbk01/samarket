import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateCampaignPushGate,
  type SettingsMaps,
} from "@/lib/admin/notification-campaigns/campaign-eligibility";
import { recordCampaignDelivery } from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { resolveCampaignUserAppState } from "@/lib/admin/notification-campaigns/campaign-presence";
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
import {
  resolveNotificationPolicyProfile,
  shouldUseOsNotificationForState,
} from "@/lib/notifications/policy/notification-policy-profiles";
import { loadActivePushTargets } from "@/lib/push/dispatch/load-active-push-targets";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
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
 * Presentation comes from buildAdminCampaignNotificationPresentation (preview SSOT).
 */
export async function sendCampaignToUser(
  svc: SupabaseClient,
  campaign: AdminNotificationCampaignRow,
  occurrenceId: string,
  userId: string,
  maps: SettingsMaps,
  opts?: { forceChannel?: CampaignChannel; skipDuplicateCheck?: boolean }
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
        : null,
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

  const appState = await resolveCampaignUserAppState(svc, userId);
  const eventType = presentation.eventType;
  const category = presentation.category as NotificationEventCategory;
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
      title: presentation.title,
      body: presentation.body,
      dedupeKey: opts?.skipDuplicateCheck
        ? `admin_campaign:${campaign.id}:${userId}:${Date.now()}`
        : `admin_campaign:${campaign.id}:${userId}`,
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

  if (campaignNeedsPush(channel)) {
    if (!shouldOsPush) {
      lastSkipReason = "foreground_no_os_push";
      await recordCampaignDelivery(svc, {
        campaignId: campaign.id,
        occurrenceId,
        userId,
        notificationEventId,
        channel: "push",
        status: "skipped",
        skipReason: "foreground_no_os_push",
      });
      if (channel === "push_only" && !inAppSent) {
        await recordUserTargetStatus(svc, campaign, occurrenceId, userId, "skipped", {
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
        const { data: devices } = await svc
          .from("user_devices")
          .select("id, notification_permission_status, push_provider, platform")
          .eq("user_id", userId)
          .eq("is_active", true);

        for (const dev of devices ?? []) {
          const deviceRow = dev as {
            id: string;
            notification_permission_status?: string | null;
          };
          if (deviceRow.notification_permission_status === "denied") {
            await recordCampaignDelivery(svc, {
              campaignId: campaign.id,
              occurrenceId,
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

        const domain = await fetchDomainBadgeAuthorityPayload(svc, userId, { force: true }).catch(
          () => null
        );
        const badgeCount = resolveMemberAppIconTotalForNativeFcm({
          memberAppIconWebTotal: domain?.memberAppIconWebTotal,
          appIconTotal: domain?.projection?.appIconTotal,
        });
        const pushPresentation = buildAdminCampaignNotificationPresentation(
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
                : null,
          },
          {
            userId,
            notificationEventId,
            badgeCount,
            occurredAt: now,
          }
        );
        const pushPayload = pushPresentation.pushPayload;

        const gate = await evaluateCampaignPushGate(svc, userId, pushPayload);
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
          const pushResult = await dispatchPushForUser(pushPayload, {
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
          }
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

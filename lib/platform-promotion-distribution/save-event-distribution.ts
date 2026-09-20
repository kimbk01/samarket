/**
 * Save Distribution configuration for one Event.
 * CONFIGURATION SAVE ≠ EXTERNAL PUSH DELIVERY.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminNotificationCampaign } from "@/lib/admin/notification-campaigns/campaign-create-service";
import {
  planBannerDistributionAdapter,
  planBellDistributionAdapter,
  planPopupDistributionAdapter,
  planPushDistributionAdapter,
} from "@/lib/platform-promotion-distribution/adapters";
import {
  listDistributionsForEvent,
  upsertEventChannelDistribution,
} from "@/lib/platform-promotion-distribution/repository";
import type {
  BannerDistributionConfig,
  BellDistributionConfig,
  PopupDistributionConfig,
  PromotionDistributionRow,
  PromotionDistributionToggleDraft,
  PushDistributionConfig,
} from "@/lib/platform-promotion-distribution/types";
import {
  createPlatformPopupAdminCampaign,
  updatePlatformPopupAdminCampaign,
} from "@/lib/platform-popup/admin-campaign-writer";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";

export type SaveEventDistributionInput = {
  eventId: string;
  eventTitle: string;
  adminUserId: string;
  toggles: PromotionDistributionToggleDraft;
  popup?: PopupDistributionConfig;
  banner?: BannerDistributionConfig;
  push?: PushDistributionConfig;
  bell?: BellDistributionConfig;
};

export type SaveEventDistributionResult = {
  ok: true;
  rows: PromotionDistributionRow[];
  plans: {
    popup: ReturnType<typeof planPopupDistributionAdapter>;
    banner: ReturnType<typeof planBannerDistributionAdapter>;
    push: ReturnType<typeof planPushDistributionAdapter>;
    bell: ReturnType<typeof planBellDistributionAdapter>;
  };
  /** Always 0 on save — Push requires explicit SEND. */
  pushDispatchCount: 0;
  bellRecordCount: 0;
};

export async function saveEventDistribution(
  sb: SupabaseClient,
  input: SaveEventDistributionInput
): Promise<SaveEventDistributionResult | { ok: false; error: string }> {
  const popupPlan = planPopupDistributionAdapter({
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    enabled: input.toggles.popup,
    config: input.popup,
  });
  if ("ok" in popupPlan && popupPlan.ok === false) {
    return { ok: false, error: popupPlan.error };
  }

  const bannerPlan = planBannerDistributionAdapter({
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    enabled: input.toggles.banner,
    config: input.banner,
  });
  if ("ok" in bannerPlan && bannerPlan.ok === false) {
    return { ok: false, error: bannerPlan.error };
  }

  const pushPlan = planPushDistributionAdapter({
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    enabled: input.toggles.push,
    config: input.push,
  });
  if ("ok" in pushPlan && pushPlan.ok === false) {
    return { ok: false, error: pushPlan.error };
  }

  const bellPlan = planBellDistributionAdapter({
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    enabled: input.toggles.bell,
    config: input.bell,
  });
  if ("ok" in bellPlan && bellPlan.ok === false) {
    return { ok: false, error: bellPlan.error };
  }

  const existing = await listDistributionsForEvent(sb, input.eventId);
  const byChannel = new Map(existing.map((r) => [r.channel, r]));

  // Popup adapter → existing popup writer
  let popupRef = byChannel.get("popup")?.channelRefId ?? null;
  if (input.toggles.popup && !("ok" in popupPlan)) {
    if (!popupRef) {
      const created = await createPlatformPopupAdminCampaign(sb, {
        adminUserId: input.adminUserId,
        name: popupPlan.name,
        surfaces: popupPlan.surfaces,
      });
      if (!created.ok) return { ok: false, error: created.error };
      popupRef = created.id;
    }
    const updated = await updatePlatformPopupAdminCampaign(sb, {
      campaignId: popupRef,
      adminUserId: input.adminUserId,
      patch: {
        name: popupPlan.name,
        startAt: popupPlan.startAt,
        endAt: popupPlan.endAt,
        ctaType: "event_detail",
        ctaTarget: input.eventId,
        surfaces: popupPlan.surfaces,
        presentationType: popupPlan.presentationType,
        frequencyMode: popupPlan.frequencyMode,
      },
    });
    if (!updated.ok) return { ok: false, error: updated.error };
  }

  // Banner adapter → ADMIN_DIRECT feed_ad (owned promo; not paid request)
  let bannerRef = byChannel.get("banner")?.channelRefId ?? null;
  if (input.toggles.banner && !("ok" in bannerPlan)) {
    if (!bannerRef) {
      const { data, error } = await sb
        .from("feed_ad_campaigns")
        .insert({
          name: bannerPlan.name,
          domain: bannerPlan.domain,
          placement: bannerPlan.placement,
          status: bannerPlan.desiredCampaignStatus === "active" ? "active" : "draft",
          destination_type: "internal_page",
          destination_id: "",
          destination_url: bannerPlan.destinationUrl,
          source: "ADMIN_DIRECT",
          start_at: bannerPlan.startAt,
          end_at: bannerPlan.endAt,
          created_by: input.adminUserId,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      bannerRef = String(data.id);
      if (bannerPlan.imageUrl) {
        await sb.from("feed_ad_creatives").insert({
          campaign_id: bannerRef,
          sort_order: 1,
          image_url: bannerPlan.imageUrl,
          headline: bannerPlan.headline,
          is_active: true,
        });
      }
    } else {
      await sb
        .from("feed_ad_campaigns")
        .update({
          name: bannerPlan.name,
          placement: bannerPlan.placement,
          domain: bannerPlan.domain,
          destination_type: "internal_page",
          destination_url: bannerPlan.destinationUrl,
          start_at: bannerPlan.startAt,
          end_at: bannerPlan.endAt,
          status: bannerPlan.desiredCampaignStatus === "active" ? "active" : "paused",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bannerRef);
    }
  } else if (!input.toggles.banner && bannerRef) {
    await sb
      .from("feed_ad_campaigns")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", bannerRef);
  }

  // Push adapter → draft campaign only (NO send)
  let pushRef = byChannel.get("push")?.channelRefId ?? null;
  if (input.toggles.push && !("ok" in pushPlan) && !pushRef) {
    const created = await createAdminNotificationCampaign(sb, input.adminUserId, {
      title: pushPlan.title,
      body: pushPlan.body,
      type: "marketing",
      target_type: pushPlan.targetType,
      channel: "push_only",
      deeplink_url: pushPlan.deeplinkUrl,
      web_url: pushPlan.deeplinkUrl,
      push_image_url: pushPlan.imageUrl,
      in_app_image_url: null,
      segment_region_code: null,
      target_payload: { platform_event_id: input.eventId },
      send_mode: "immediate",
      scheduled_at: null,
      create_request_id: `event-dist-push:${input.eventId}`,
      save_as_draft: true,
    });
    if (!created.ok) return { ok: false, error: created.error };
    pushRef = created.campaignId;
  }

  // Bell adapter → separate in_app_only draft (NO push)
  let bellRef = byChannel.get("bell")?.channelRefId ?? null;
  if (input.toggles.bell && !("ok" in bellPlan) && !bellRef) {
    const created = await createAdminNotificationCampaign(sb, input.adminUserId, {
      title: bellPlan.title,
      body: bellPlan.body,
      type: "marketing",
      target_type: bellPlan.targetType,
      channel: "in_app_only",
      deeplink_url: bellPlan.deeplinkUrl,
      web_url: bellPlan.deeplinkUrl,
      push_image_url: null,
      in_app_image_url: bellPlan.imageUrl,
      segment_region_code: null,
      target_payload: { platform_event_id: input.eventId },
      send_mode: "immediate",
      scheduled_at: null,
      create_request_id: `event-dist-bell:${input.eventId}`,
      save_as_draft: true,
    });
    if (!created.ok) return { ok: false, error: created.error };
    bellRef = created.campaignId;
  }

  await upsertEventChannelDistribution(sb, {
    eventId: input.eventId,
    channel: "popup",
    enabled: input.toggles.popup,
    config: (input.popup ?? {}) as Record<string, unknown>,
    channelRefType: popupRef ? "platform_popup_campaign" : null,
    channelRefId: popupRef,
    adminUserId: input.adminUserId,
  });
  await upsertEventChannelDistribution(sb, {
    eventId: input.eventId,
    channel: "banner",
    enabled: input.toggles.banner,
    config: (input.banner ?? {}) as Record<string, unknown>,
    channelRefType: bannerRef ? "feed_ad_campaign" : null,
    channelRefId: bannerRef,
    adminUserId: input.adminUserId,
  });
  await upsertEventChannelDistribution(sb, {
    eventId: input.eventId,
    channel: "push",
    enabled: input.toggles.push,
    config: (input.push ?? {}) as Record<string, unknown>,
    channelRefType: pushRef ? "admin_notification_campaign" : null,
    channelRefId: pushRef,
    adminUserId: input.adminUserId,
  });
  await upsertEventChannelDistribution(sb, {
    eventId: input.eventId,
    channel: "bell",
    enabled: input.toggles.bell,
    config: (input.bell ?? {}) as Record<string, unknown>,
    channelRefType: bellRef ? "admin_notification_campaign" : null,
    channelRefId: bellRef,
    adminUserId: input.adminUserId,
  });

  const rows = await listDistributionsForEvent(sb, input.eventId);
  return {
    ok: true,
    rows,
    plans: {
      popup: popupPlan,
      banner: bannerPlan,
      push: pushPlan,
      bell: bellPlan,
    },
    pushDispatchCount: 0,
    bellRecordCount: 0,
  };
}

/** Explicit Push SEND gate — separate from save/publish. */
export function assertExplicitPushSendAllowed(input: {
  pushEnabled: boolean;
  distributionPushRefId: string | null;
}): { ok: true; deeplink: (eventId: string) => string } | { ok: false; error: string } {
  if (!input.pushEnabled) return { ok: false, error: "push_disabled" };
  if (!input.distributionPushRefId) return { ok: false, error: "push_not_configured" };
  return {
    ok: true,
    deeplink: (eventId: string) => buildPlatformEventDetailPath(eventId),
  };
}

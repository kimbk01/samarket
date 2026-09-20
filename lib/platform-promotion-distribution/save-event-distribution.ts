/**
 * Save Distribution configuration for one Event.
 * CONFIGURATION SAVE ≠ EXTERNAL PUSH DELIVERY.
 * Partial channel failure must not report full success.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminNotificationCampaign } from "@/lib/admin/notification-campaigns/campaign-create-service";
import { isPlatformEventPubliclyAvailable } from "@/lib/platform-events/publication";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import {
  planBannerDistributionAdapter,
  planBellDistributionAdapter,
  planPopupDistributionAdapter,
  planPushDistributionAdapter,
} from "@/lib/platform-promotion-distribution/adapters";
import {
  allChannelsSucceeded,
  type ChannelMaterializeStatus,
  type DistributionChannelResults,
} from "@/lib/platform-promotion-distribution/channel-results";
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
  replacePlatformPopupReadyCreative,
  updatePlatformPopupAdminCampaign,
} from "@/lib/platform-popup/admin-campaign-writer";

export type SaveEventDistributionInput = {
  eventId: string;
  eventTitle: string;
  adminUserId: string;
  toggles: PromotionDistributionToggleDraft;
  popup?: PopupDistributionConfig;
  banner?: BannerDistributionConfig;
  push?: PushDistributionConfig;
  bell?: BellDistributionConfig;
  /** Phase 2 publication SSOT fields — do not invent a second gate. */
  eventPublication?: {
    status?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
  };
};

export type SaveEventDistributionResult = {
  ok: boolean;
  rows: PromotionDistributionRow[];
  channels: DistributionChannelResults;
  /** Always 0 on save — Push requires explicit SEND. */
  pushDispatchCount: 0;
  /** Bell inbox rows are not created on config save. */
  bellRecordCount: 0;
  error?: string;
};

async function pausePopupCampaign(
  sb: SupabaseClient,
  campaignId: string
): Promise<{ error: string | null }> {
  const { error } = await sb
    .from("platform_popup_campaigns")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  return { error: error?.message ?? null };
}

async function pauseFeedAdCampaign(
  sb: SupabaseClient,
  campaignId: string
): Promise<{ error: string | null }> {
  const { error } = await sb
    .from("feed_ad_campaigns")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  return { error: error?.message ?? null };
}

async function materializePopup(
  sb: SupabaseClient,
  input: SaveEventDistributionInput,
  existingRef: string | null,
  eventPubliclyActive: boolean
): Promise<ChannelMaterializeStatus> {
  const planned = planPopupDistributionAdapter({
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    enabled: input.toggles.popup,
    config: input.popup,
  });
  if (!planned.ok) return { ok: false, error: planned.error };
  const plan = planned.value;

  if (!input.toggles.popup) {
    if (!existingRef) return { ok: true, channelRefId: null, action: "noop" };
    const paused = await pausePopupCampaign(sb, existingRef);
    if (paused.error) return { ok: false, error: paused.error, channelRefId: existingRef };
    return { ok: true, channelRefId: existingRef, action: "paused" };
  }

  let ref = existingRef;
  let action: "created" | "updated" = "updated";
  if (!ref) {
    const created = await createPlatformPopupAdminCampaign(sb, {
      adminUserId: input.adminUserId,
      name: plan.name,
      surfaces: plan.surfaces,
    });
    if (!created.ok) return { ok: false, error: created.error };
    ref = created.id;
    action = "created";
  }

  const updated = await updatePlatformPopupAdminCampaign(sb, {
    campaignId: ref,
    adminUserId: input.adminUserId,
    patch: {
      name: plan.name,
      startAt: plan.startAt,
      endAt: plan.endAt,
      ctaType: "event_detail",
      ctaTarget: input.eventId,
      surfaces: plan.surfaces,
      presentationType: plan.presentationType,
      frequencyMode: plan.frequencyMode,
      creativeMode: plan.creativeMode,
    },
  });
  if (!updated.ok) return { ok: false, error: updated.error, channelRefId: ref };

  if (plan.imageUrl && plan.imagePath) {
    const creative = await replacePlatformPopupReadyCreative(sb, {
      campaignId: ref,
      adminUserId: input.adminUserId,
      assetPath: plan.imagePath,
      assetUrl: plan.imageUrl,
      altText: plan.name,
      creativeMode: plan.creativeMode,
      aspectW: plan.creativeMode === "artwork" ? 1 : 36,
      aspectH: plan.creativeMode === "artwork" ? 1 : 25,
    });
    if (!creative.ok) return { ok: false, error: creative.error, channelRefId: ref };
  }

  // Publication guard: never leave interruptive popup active for non-public Events.
  if (!eventPubliclyActive) {
    const paused = await pausePopupCampaign(sb, ref);
    if (paused.error) return { ok: false, error: paused.error, channelRefId: ref };
  }

  return { ok: true, channelRefId: ref, action };
}

async function materializeBanner(
  sb: SupabaseClient,
  input: SaveEventDistributionInput,
  existingRef: string | null,
  eventPubliclyActive: boolean
): Promise<ChannelMaterializeStatus> {
  const planned = planBannerDistributionAdapter({
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    enabled: input.toggles.banner,
    config: input.banner,
  });
  if (!planned.ok) return { ok: false, error: planned.error };
  const plan = planned.value;

  // HERO: owned promo uses Distribution config + DeliveryAdBanner geometry.
  // Never write Delivery paid campaigns; pause any prior INLINE feed_ad ref.
  if (!plan.materializeFeedAd) {
    if (existingRef) {
      const paused = await pauseFeedAdCampaign(sb, existingRef);
      if (paused.error) return { ok: false, error: paused.error, channelRefId: existingRef };
      return { ok: true, channelRefId: null, action: "paused" };
    }
    return { ok: true, channelRefId: null, action: "noop" };
  }

  if (!input.toggles.banner) {
    if (!existingRef) return { ok: true, channelRefId: null, action: "noop" };
    const paused = await pauseFeedAdCampaign(sb, existingRef);
    if (paused.error) return { ok: false, error: paused.error, channelRefId: existingRef };
    return { ok: true, channelRefId: existingRef, action: "paused" };
  }

  const desiredStatus =
    eventPubliclyActive && plan.desiredCampaignStatus === "active" ? "active" : "draft";

  if (!existingRef) {
    const { data, error } = await sb
      .from("feed_ad_campaigns")
      .insert({
        name: plan.name,
        domain: plan.domain,
        placement: plan.placement,
        status: desiredStatus,
        destination_type: "internal_page",
        destination_id: "",
        destination_url: plan.destinationUrl,
        source: "ADMIN_DIRECT",
        start_at: plan.startAt,
        end_at: plan.endAt,
        created_by: input.adminUserId,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    const ref = String(data.id);
    if (plan.imageUrl) {
      const { error: cErr } = await sb.from("feed_ad_creatives").insert({
        campaign_id: ref,
        sort_order: 1,
        image_url: plan.imageUrl,
        headline: plan.headline,
        is_active: true,
      });
      if (cErr) return { ok: false, error: cErr.message, channelRefId: ref };
    }
    return { ok: true, channelRefId: ref, action: "created" };
  }

  const { error } = await sb
    .from("feed_ad_campaigns")
    .update({
      name: plan.name,
      placement: plan.placement,
      domain: plan.domain,
      destination_type: "internal_page",
      destination_url: plan.destinationUrl,
      start_at: plan.startAt,
      end_at: plan.endAt,
      status: desiredStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingRef);
  if (error) return { ok: false, error: error.message, channelRefId: existingRef };
  return { ok: true, channelRefId: existingRef, action: "updated" };
}

async function materializePush(
  sb: SupabaseClient,
  input: SaveEventDistributionInput,
  existingRef: string | null
): Promise<ChannelMaterializeStatus> {
  const planned = planPushDistributionAdapter({
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    enabled: input.toggles.push,
    config: input.push,
  });
  if (!planned.ok) return { ok: false, error: planned.error };
  const plan = planned.value;

  if (!input.toggles.push) {
    // Keep historical draft campaign; distribution.enabled=false gates send.
    return {
      ok: true,
      channelRefId: existingRef,
      action: existingRef ? "paused" : "noop",
    };
  }

  // Always go through create with stable create_request_id for idempotency.
  const created = await createAdminNotificationCampaign(sb, input.adminUserId, {
    title: plan.title,
    body: plan.body,
    type: "marketing",
    target_type: plan.targetType,
    channel: "push_only",
    deeplink_url: plan.deeplinkUrl,
    web_url: plan.deeplinkUrl,
    push_image_url: plan.imageUrl,
    in_app_image_url: null,
    segment_region_code: null,
    target_payload: { platform_event_id: input.eventId },
    send_mode: "immediate",
    scheduled_at: null,
    create_request_id: `event-dist-push:${input.eventId}`,
    save_as_draft: true,
  });
  if (!created.ok) return { ok: false, error: created.error };
  return {
    ok: true,
    channelRefId: created.campaignId,
    action: created.replay || existingRef ? "updated" : "created",
  };
}

async function materializeBell(
  sb: SupabaseClient,
  input: SaveEventDistributionInput,
  existingRef: string | null
): Promise<ChannelMaterializeStatus> {
  const planned = planBellDistributionAdapter({
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    enabled: input.toggles.bell,
    config: input.bell,
  });
  if (!planned.ok) return { ok: false, error: planned.error };
  const plan = planned.value;

  if (!input.toggles.bell) {
    return {
      ok: true,
      channelRefId: existingRef,
      action: existingRef ? "paused" : "noop",
    };
  }

  const created = await createAdminNotificationCampaign(sb, input.adminUserId, {
    title: plan.title,
    body: plan.body,
    type: "marketing",
    target_type: plan.targetType,
    channel: "in_app_only",
    deeplink_url: plan.deeplinkUrl,
    web_url: plan.deeplinkUrl,
    push_image_url: null,
    in_app_image_url: plan.imageUrl,
    segment_region_code: null,
    target_payload: { platform_event_id: input.eventId },
    send_mode: "immediate",
    scheduled_at: null,
    create_request_id: `event-dist-bell:${input.eventId}`,
    save_as_draft: true,
  });
  if (!created.ok) return { ok: false, error: created.error };
  return {
    ok: true,
    channelRefId: created.campaignId,
    action: created.replay || existingRef ? "updated" : "created",
  };
}

export async function saveEventDistribution(
  sb: SupabaseClient,
  input: SaveEventDistributionInput
): Promise<SaveEventDistributionResult> {
  const eventPubliclyActive = isPlatformEventPubliclyAvailable(
    input.eventPublication ?? { status: "published" }
  );

  const existing = await listDistributionsForEvent(sb, input.eventId);
  const byChannel = new Map(existing.map((r) => [r.channel, r]));

  const channels: DistributionChannelResults = {
    popup: await materializePopup(
      sb,
      input,
      byChannel.get("popup")?.channelRefId ?? null,
      eventPubliclyActive
    ),
    banner: await materializeBanner(
      sb,
      input,
      byChannel.get("banner")?.channelRefId ?? null,
      eventPubliclyActive
    ),
    push: await materializePush(sb, input, byChannel.get("push")?.channelRefId ?? null),
    bell: await materializeBell(sb, input, byChannel.get("bell")?.channelRefId ?? null),
  };

  // Persist orchestration refs for channels that succeeded (including OFF/pause).
  const persistPairs: Array<{
    channel: "popup" | "banner" | "push" | "bell";
    enabled: boolean;
    config: Record<string, unknown>;
    refType: string | null;
    result: ChannelMaterializeStatus;
  }> = [
    {
      channel: "popup",
      enabled: input.toggles.popup,
      config: (input.popup ?? {}) as Record<string, unknown>,
      refType: "platform_popup_campaign",
      result: channels.popup,
    },
    {
      channel: "banner",
      enabled: input.toggles.banner,
      config: (input.banner ?? {}) as Record<string, unknown>,
      refType: "feed_ad_campaign",
      result: channels.banner,
    },
    {
      channel: "push",
      enabled: input.toggles.push,
      config: (input.push ?? {}) as Record<string, unknown>,
      refType: "admin_notification_campaign",
      result: channels.push,
    },
    {
      channel: "bell",
      enabled: input.toggles.bell,
      config: (input.bell ?? {}) as Record<string, unknown>,
      refType: "admin_notification_campaign",
      result: channels.bell,
    },
  ];

  for (const p of persistPairs) {
    if (!p.result.ok) continue;
    await upsertEventChannelDistribution(sb, {
      eventId: input.eventId,
      channel: p.channel,
      enabled: p.enabled,
      config: p.config,
      channelRefType: p.result.channelRefId ? p.refType : null,
      channelRefId: p.result.channelRefId,
      adminUserId: input.adminUserId,
    });
  }

  const rows = await listDistributionsForEvent(sb, input.eventId);
  const ok = allChannelsSucceeded(channels);
  const firstFail = (["popup", "banner", "push", "bell"] as const).find((k) => !channels[k].ok);
  return {
    ok,
    rows,
    channels,
    pushDispatchCount: 0,
    bellRecordCount: 0,
    error: firstFail && !channels[firstFail].ok ? channels[firstFail].error : undefined,
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

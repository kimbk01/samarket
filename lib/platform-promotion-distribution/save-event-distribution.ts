/**
 * Save Distribution configuration for one Event.
 * CONFIGURATION SAVE ≠ EXTERNAL PUSH DELIVERY.
 * Partial channel failure must not report full success.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminNotificationCampaign } from "@/lib/admin/notification-campaigns/campaign-create-service";
import { updateUnsentDraftCampaignContent } from "@/lib/admin/notification-campaigns/campaign-draft-content";
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
import { isFeedAdPoolCapacityDbError } from "@/lib/ads/feed-ad-pool-capacity";
import {
  createPlatformPopupAdminCampaign,
  replacePlatformPopupReadyCreative,
  updatePlatformPopupAdminCampaign,
} from "@/lib/platform-popup/admin-campaign-writer";
import { transitionPlatformPopupCampaign } from "@/lib/platform-popup/admin-transitions";

export type SaveEventDistributionInput = {
  eventId: string;
  eventTitle: string;
  adminUserId: string;
  toggles: PromotionDistributionToggleDraft;
  popup?: PopupDistributionConfig;
  banner?: BannerDistributionConfig;
  push?: PushDistributionConfig;
  bell?: BellDistributionConfig;
  /**
   * 감사 AD-09: 지정하면 이 채널만 저장·전환한다. 나머지 채널은 읽지도 다시 쓰지도 않는다 (noop).
   * 배너 목록의 「중지」가 팝업·푸시·알림 설정까지 다시 저장하던 부작용 제거. 생략 = 전체 (기존 동작).
   */
  onlyChannels?: Array<"popup" | "banner" | "push" | "bell">;
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

/**
 * AL-11 (2026-11-04): 팝업 정지는 팝업 전이 규칙(`transitionPlatformPopupCampaign` · 감사 기록 포함)으로만 한다.
 * 이미 노출되지 않는 상태(초안·정지·종료 등)면 그대로 둔다 — 상태를 직접 덮어쓰지 않는다.
 */
async function pausePopupCampaign(
  sb: SupabaseClient,
  campaignId: string,
  adminUserId: string
): Promise<{ error: string | null }> {
  const { data: row, error: readErr } = await sb
    .from("platform_popup_campaigns")
    .select("status")
    .eq("id", campaignId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  const status = String((row as { status?: string } | null)?.status ?? "");
  if (!row || (status !== "active" && status !== "scheduled")) return { error: null };
  const r = await transitionPlatformPopupCampaign(sb, {
    campaignId,
    actorUserId: adminUserId,
    actorRole: "admin",
    nextStatus: "paused",
    reason: "event_distribution_pause",
  });
  return { error: r.ok ? null : r.error };
}

type FeedCampaignLockState = { exists: boolean; status: string; pausedBy: string | null };

async function readFeedCampaignLockState(sb: SupabaseClient, campaignId: string): Promise<FeedCampaignLockState | { error: string }> {
  const { data, error } = await sb
    .from("feed_ad_campaigns")
    .select("id, status, paused_by")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) return { error: error.message };
  const row = data as { status?: string | null; paused_by?: string | null } | null;
  return {
    exists: Boolean(row),
    status: String(row?.status ?? "").toLowerCase(),
    pausedBy: row?.paused_by != null ? String(row.paused_by).toLowerCase() : null,
  };
}

/**
 * AL-11: 관리자가 정지(`paused_by='admin'`)하거나 종료한 캠페인은 이벤트 저장이 상태를 바꾸지 않는다.
 * 이벤트 저장이 스스로 끈 종료(`retireFeedAdCampaign` · `paused_by='system'`)만 이벤트가 다시 켤 수 있다.
 */
export function feedAdCampaignLockedByAdmin(state: { status: string; pausedBy: string | null }): "admin_paused" | "admin_ended" | null {
  if (state.status === "paused" && state.pausedBy === "admin") return "admin_paused";
  if (state.status === "ended" && state.pausedBy !== "system") return "admin_ended";
  return null;
}

/**
 * 재감사 F-05 (2026-11-04 · P1): 이벤트 배너를 끄면 피드 캠페인을 **종료(ended)** 한다.
 * 예전에는 `paused` 로만 바꿨는데, 일시정지는 피드 배너 자리(풀 3)를 계속 차지한다(종료일이 없으면 영구 점유 —
 * QA 이벤트 배너 15행이 이렇게 남아 회원 광고 승인·연장을 막았다). 다시 켜면 같은 캠페인을 저장 경로가
 * `active` 로 되돌리고, 그때 DB 트리거가 자리를 다시 검사한다.
 */
async function retireFeedAdCampaign(
  sb: SupabaseClient,
  campaignId: string
): Promise<{ error: string | null; locked?: boolean }> {
  const state = await readFeedCampaignLockState(sb, campaignId);
  if ("error" in state) return { error: state.error };
  if (!state.exists) return { error: null };
  // AL-11: 관리자가 정지·종료한 캠페인은 건드리지 않는다
  if (feedAdCampaignLockedByAdmin(state)) return { error: null, locked: true };
  if (state.status === "ended") return { error: null };
  // 이벤트가 끈 종료 = paused_by 'system' 표시 (다시 켤 때 관리자 종료와 구분)
  const { error } = await sb
    .from("feed_ad_campaigns")
    .update({ status: "ended", paused_by: "system", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .in("status", ["active", "scheduled", "paused", "draft"]);
  return { error: error?.message ?? null };
}

/**
 * FB-A15 (2026-11-04): 이벤트 배너를 고치면 피드 소재(이미지·제목)도 같이 고친다.
 * - 이미지가 같으면 제목만 그 행에서 고친다.
 * - 이미지가 바뀌면 **새 소재 행**을 만들고 옛 행은 비활성(노출 기록 보존 · D-25 「소재별 노출 합」).
 *   소재 칸(sort_order 1~3 · 고유)이 다 찼으면 지금 쓰는 행을 제자리에서 고친다(남은 위험으로 보고).
 */
async function syncEventFeedCreative(
  sb: SupabaseClient,
  campaignId: string,
  plan: { imageUrl: string; headline: string }
): Promise<{ error: string | null }> {
  if (!plan.imageUrl) return { error: null };
  const { data, error } = await sb
    .from("feed_ad_creatives")
    .select("id, sort_order, image_url, headline, is_active")
    .eq("campaign_id", campaignId);
  if (error) return { error: error.message };
  const rows = (data ?? []) as { id: string; sort_order: number; image_url: string; headline: string; is_active: boolean }[];
  const active = rows.filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;
  const now = new Date().toISOString();
  if (active && active.image_url === plan.imageUrl) {
    if (active.headline === plan.headline) return { error: null };
    const { error: uErr } = await sb
      .from("feed_ad_creatives")
      .update({ headline: plan.headline, updated_at: now })
      .eq("id", active.id);
    return { error: uErr?.message ?? null };
  }
  const used = new Set(rows.map((r) => Number(r.sort_order)));
  const free = [1, 2, 3].find((n) => !used.has(n));
  if (free == null) {
    const target = active ?? rows[0];
    if (!target) return { error: null };
    const { error: uErr } = await sb
      .from("feed_ad_creatives")
      .update({ image_url: plan.imageUrl, headline: plan.headline, is_active: true, updated_at: now })
      .eq("id", target.id);
    return { error: uErr?.message ?? null };
  }
  const { error: iErr } = await sb.from("feed_ad_creatives").insert({
    campaign_id: campaignId,
    sort_order: free,
    image_url: plan.imageUrl,
    headline: plan.headline,
    is_active: true,
  });
  if (iErr) return { error: iErr.message };
  const oldIds = rows.filter((r) => r.is_active).map((r) => r.id);
  if (oldIds.length) {
    const { error: dErr } = await sb
      .from("feed_ad_creatives")
      .update({ is_active: false, updated_at: now })
      .in("id", oldIds);
    if (dErr) return { error: dErr.message };
  }
  return { error: null };
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
    const paused = await pausePopupCampaign(sb, existingRef, input.adminUserId);
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
    const paused = await pausePopupCampaign(sb, ref, input.adminUserId);
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
      const paused = await retireFeedAdCampaign(sb, existingRef);
      if (paused.error) return { ok: false, error: paused.error, channelRefId: existingRef };
      return { ok: true, channelRefId: null, action: "ended" };
    }
    return { ok: true, channelRefId: null, action: "noop" };
  }

  if (!input.toggles.banner) {
    if (!existingRef) return { ok: true, channelRefId: null, action: "noop" };
    const paused = await retireFeedAdCampaign(sb, existingRef);
    if (paused.error) return { ok: false, error: paused.error, channelRefId: existingRef };
    return { ok: true, channelRefId: existingRef, action: paused.locked ? "noop" : "ended" };
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
    // 광고 S-3: 피드 배너 풀(위치별 3)이 차면 DB 트리거가 막는다 — 다른 피드 배너와 같은 「자리 없음」
    if (isFeedAdPoolCapacityDbError(error)) return { ok: false, error: "capacity_full" };
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

  const state = await readFeedCampaignLockState(sb, existingRef);
  if ("error" in state) return { ok: false, error: state.error, channelRefId: existingRef };
  const lock = feedAdCampaignLockedByAdmin(state);
  // AL-11: 관리자 종료 = 게시 이력 보존 — 이벤트 저장이 내용·상태를 바꾸지 않는다
  if (lock === "admin_ended") return { ok: true, channelRefId: existingRef, action: "noop" };

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
      // AL-11: 관리자 정지면 상태는 그대로 (내용만 이벤트를 따른다)
      ...(lock === "admin_paused" ? {} : { status: desiredStatus, paused_by: null }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existingRef);
  if (isFeedAdPoolCapacityDbError(error)) return { ok: false, error: "capacity_full", channelRefId: existingRef };
  if (error) return { ok: false, error: error.message, channelRefId: existingRef };
  // FB-A15: 소재(이미지·제목)도 이벤트를 따른다
  const creative = await syncEventFeedCreative(sb, existingRef, { imageUrl: plan.imageUrl, headline: plan.headline });
  if (creative.error) return { ok: false, error: creative.error, channelRefId: existingRef };
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
  if (!created.replay) return { ok: true, channelRefId: created.campaignId, action: "created" };
  // Replay: refresh the unsent draft with the saved content; sent campaigns are not changed.
  const refreshed = await updateUnsentDraftCampaignContent(sb, created.campaignId, input.adminUserId, {
    title: plan.title,
    body: plan.body,
    target_type: plan.targetType,
    channel: "push_only",
    deeplink_url: plan.deeplinkUrl,
    web_url: plan.deeplinkUrl,
    push_image_url: plan.imageUrl,
    in_app_image_url: null,
    target_payload: { platform_event_id: input.eventId },
  });
  return {
    ok: true,
    channelRefId: created.campaignId,
    action: refreshed.updated ? "updated" : "noop",
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
  if (!created.replay) return { ok: true, channelRefId: created.campaignId, action: "created" };
  // Replay: refresh the unsent draft with the saved content; sent campaigns are not changed.
  const refreshed = await updateUnsentDraftCampaignContent(sb, created.campaignId, input.adminUserId, {
    title: plan.title,
    body: plan.body,
    target_type: plan.targetType,
    channel: "in_app_only",
    deeplink_url: plan.deeplinkUrl,
    web_url: plan.deeplinkUrl,
    push_image_url: null,
    in_app_image_url: plan.imageUrl,
    target_payload: { platform_event_id: input.eventId },
  });
  return {
    ok: true,
    channelRefId: created.campaignId,
    action: refreshed.updated ? "updated" : "noop",
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

  const only = input.onlyChannels?.length ? new Set(input.onlyChannels) : null;
  const skip = (channel: "popup" | "banner" | "push" | "bell"): ChannelMaterializeStatus => ({
    ok: true,
    channelRefId: byChannel.get(channel)?.channelRefId ?? null,
    action: "noop",
  });
  const channels: DistributionChannelResults = {
    popup:
      only && !only.has("popup")
        ? skip("popup")
        : await materializePopup(
            sb,
            input,
            byChannel.get("popup")?.channelRefId ?? null,
            eventPubliclyActive
          ),
    banner:
      only && !only.has("banner")
        ? skip("banner")
        : await materializeBanner(
            sb,
            input,
            byChannel.get("banner")?.channelRefId ?? null,
            eventPubliclyActive
          ),
    push:
      only && !only.has("push")
        ? skip("push")
        : await materializePush(sb, input, byChannel.get("push")?.channelRefId ?? null),
    bell:
      only && !only.has("bell")
        ? skip("bell")
        : await materializeBell(sb, input, byChannel.get("bell")?.channelRefId ?? null),
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
    if (only && !only.has(p.channel)) continue;
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

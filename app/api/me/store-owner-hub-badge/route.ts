/**
 * 배달 입점(스토어) 오너 허브 배지: 소셜 채팅 미읽음 + 배달 주문(접수·환불) + 미답변 문의 + 배달채팅 미읽음.
 * `chatUnread` = 거래채팅(`/chats`·trade segment) — 메신저에 연동된 `item_trade` 방은 제외해 CM unread 와 이중 집계 없음.
 * `communityMessengerUnread` = SAMarket 메신저(`community_messenger_participants`) — 하단 「메신저」탭.
 * `philifeChatUnread` = 커뮤니티·일반 DM 등(커뮤니티 계열 참가자 미읽음) — 「커뮤니티」탭 뱃지.
 * `socialChatUnread` = 거래+필라이프 등(chat_rooms/product_chats) 합. `storesTabAttention`은 「배달」탭.
 * GET /api/me/store-owner-hub-badge — 비로그인 시 total 0
 * 서버 단기 캐시: `lib/chats/owner-hub-badge-cache.ts` — 클라 정책 표는 `docs/messenger-realtime-policy.md`
 *
 * 세그먼트(동일 집계 로직 분리): `.../unreads`, `.../store-attention`
 */
import { NextResponse } from "next/server";
import { getOptionalRouteHandlerCookieAuth } from "@/lib/auth/get-optional-authenticated-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  getCachedOwnerHubBadge,
  invalidateOwnerHubBadgeCache,
  ownerHubBadgeRouteCacheKey,
  peekOwnerHubBadgeCacheHit,
  peekOwnerHubBadgeInflight,
  OWNER_HUB_BADGE_TTL_MS,
} from "@/lib/chats/owner-hub-badge-cache";
import {
  buildHubColdClientWallBreakdown,
  logHubColdClientWallBreakdown,
} from "@/lib/chats/hub-cold-client-wall-breakdown";
import {
  buildRoutePerfClientObservability,
  buildRoutePerfDedupeFields,
} from "@/lib/http/route-perf-dedupe-fields";
import { buildOwnerHubBadgePayloadWithMeta } from "@/lib/chats/build-owner-hub-badge-payload";
import {
  hubBadgeBreakdownForUser,
  logHubBadgeBreakdown,
  peekLastHubBadgeBreakdown,
} from "@/lib/chats/hub-badge-breakdown";
import { peekLastUnreadPartsComputeMeta } from "@/lib/chat/user-chat-unread-parts";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { devPerfNow, logDevApiPerf } from "@/lib/dev/dev-api-perf-log";
import { logRoutePerf } from "@/lib/http/route-perf-log";
import {
  buildOwnerDashboardPerfV2,
  logOwnerDashboardPerfV2,
} from "@/lib/stores/owner-dashboard-perf-v2";
import { shouldBypassRouteMemoryCache } from "@/lib/http/route-cache-bypass";
import { observeCmUnreadAggregateOnHubRouteCacheHit } from "@/lib/community-messenger/cm-unread-room-count-aggregate";
import { invalidateCommunityMessengerUnreadTotalCache } from "@/lib/community-messenger/community-messenger-unread-total";
import {
  buildPerfMeasureResponseHeaders,
  isOwnerDashboardMeasureInvalidateEnabled,
  logProdRegionContextOnce,
} from "@/lib/performance/prod-same-region-perf";
import { buildSnapshotSignoffHeaders } from "@/lib/http/snapshot-signoff-response-headers";
import { hubBadgeSignoffObs } from "@/lib/chats/hub-badge-signoff-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const t0 = devPerfNow();
  const url = new URL(request.url);
  const cmFresh = url.searchParams.get("cmFresh") === "1";
  const hubBadgeBypass = url.searchParams.get("hubBadgeBypass") === "1";
  const findHubFresh = url.searchParams.get("findHubFresh") === "1";
  const unreadPartsFresh = url.searchParams.get("unreadPartsFresh") === "1";
  const cmUnreadFresh = url.searchParams.get("cmUnreadFresh") === "1";
  const storeOrderUnreadFresh = url.searchParams.get("storeOrderUnreadFresh") === "1";
  const storeAttentionFresh = url.searchParams.get("storeAttentionFresh") === "1";
  /** prod: cmFresh → 짧은 캐시 bypass. dev-safe: cmFresh 만으로는 bypass 안 함 — `hubBadgeBypass=1` 필요 */
  const bypassShortCache = cmFresh && (!isDevSafeMode() || hubBadgeBypass);

  const parallel0 = devPerfNow();
  const [sb, cookieAuth] = await Promise.all([
    Promise.resolve(tryCreateSupabaseServiceClient()),
    getOptionalRouteHandlerCookieAuth(),
  ]);
  const authMs = Math.round(devPerfNow() - parallel0);
  const userId = cookieAuth.userId;

  if (!sb) {
    if (process.env.NODE_ENV === "production") {
      console.error("[store-owner-hub-badge] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 미설정");
    }
    return NextResponse.json({
      ok: true,
      degraded: true,
      total: 0,
      chatUnread: 0,
      communityMessengerUnread: 0,
      philifeChatUnread: 0,
      socialChatUnread: 0,
      storeOrderChatUnread: 0,
      orderAttention: 0,
      inquiryAttention: 0,
      storesTabAttention: 0,
      storeDeepLink: null,
    });
  }

  if (!userId) {
    return NextResponse.json({
      ok: true,
      total: 0,
      chatUnread: 0,
      communityMessengerUnread: 0,
      philifeChatUnread: 0,
      socialChatUnread: 0,
      storeOrderChatUnread: 0,
      orderAttention: 0,
      inquiryAttention: 0,
      storesTabAttention: 0,
      storeDeepLink: null,
    });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  if (isOwnerDashboardMeasureInvalidateEnabled()) {
    if (request.headers.get("x-samarket-hub-badge-measure") === "1") {
      invalidateOwnerHubBadgeCache(userId);
    }
    if (request.headers.get("x-samarket-cm-unread-measure") === "1") {
      invalidateOwnerHubBadgeCache(userId);
      invalidateCommunityMessengerUnreadTotalCache(userId);
    }
    if (
      request.headers.get("x-samarket-prod-same-region-measure") === "1" ||
      request.headers.get("x-samarket-hub-badge-measure") === "1"
    ) {
      logProdRegionContextOnce({ runtime: "nodejs" });
    }
  }

  const findHubStoreFresh =
    findHubFresh && hubBadgeBypass && process.env.NODE_ENV === "development";
  const unreadPartsStoreFresh =
    unreadPartsFresh && hubBadgeBypass && process.env.NODE_ENV === "development";
  const cmUnreadStoreFresh =
    cmUnreadFresh && hubBadgeBypass && process.env.NODE_ENV === "development";
  const storeOrderUnreadStoreFresh =
    storeOrderUnreadFresh && hubBadgeBypass && process.env.NODE_ENV === "development";
  const storeAttentionStoreFresh =
    storeAttentionFresh && hubBadgeBypass && process.env.NODE_ENV === "development";

  const stores0 = devPerfNow();
  const storesSb = tryGetSupabaseForStores();
  const storesClientMs = devPerfNow() - stores0;

  const cacheLookup0 = devPerfNow();
  const requestDedupeKey = ownerHubBadgeRouteCacheKey(userId);
  const bypassMemoryCache = shouldBypassRouteMemoryCache(url.searchParams) || hubBadgeBypass;
  const ttlCacheHit =
    !bypassShortCache && !bypassMemoryCache && peekOwnerHubBadgeCacheHit(userId);
  const inFlightBefore =
    !bypassShortCache && !bypassMemoryCache && !ttlCacheHit && peekOwnerHubBadgeInflight(userId);
  const cache_lookup_ms = Math.round(devPerfNow() - cacheLookup0);
  const build0 = devPerfNow();
  let payload: Awaited<ReturnType<typeof buildOwnerHubBadgePayloadWithMeta>>["payload"];
  let badgeMeta: Awaited<ReturnType<typeof buildOwnerHubBadgePayloadWithMeta>>["meta"];
  let hubBreakdown = peekLastHubBadgeBreakdown();
  if (bypassShortCache) {
    const built = await buildOwnerHubBadgePayloadWithMeta(sbAny, storesSb, userId, {
      findHubStoreFresh,
      unreadPartsFresh: unreadPartsStoreFresh,
      cmUnreadFresh: cmUnreadStoreFresh,
      storeOrderUnreadFresh: storeOrderUnreadStoreFresh,
      storeAttentionFresh: storeAttentionStoreFresh,
    });
    payload = built.payload;
    badgeMeta = built.meta;
    hubBreakdown = built.breakdown;
  } else if (ttlCacheHit) {
    observeCmUnreadAggregateOnHubRouteCacheHit(userId);
    payload = await getCachedOwnerHubBadge(userId, async () => {
      const built = await buildOwnerHubBadgePayloadWithMeta(sbAny, storesSb, userId);
      hubBreakdown = built.breakdown;
      return built.payload;
    });
    badgeMeta = {
      queryType: "owner_hub_badge_light",
      aggregateFallbackUsed: 0,
      aggregateRemovedSuccess: 1,
      existsQueryUsed: 0,
    };
    logHubBadgeBreakdown({
      total_ms: 0,
      find_hub_store_ms: 0,
      unread_parts_ms: 0,
      cm_unread_ms: 0,
      store_order_unread_ms: 0,
      store_attention_total_ms: 0,
      refund_pending_ms: 0,
      order_pending_ms: 0,
      inquiry_pending_ms: 0,
      payload_build_ms: 0,
      cache_hit: 1,
      cache_hit_reason: "hub_badge_memory_ttl",
      has_hub_store: 0,
      query_wave_1_ms: 0,
      query_wave_2_ms: 0,
      query_wave_3_ms: 0,
      worst_stage: "hub_badge_memory_ttl",
      worst_stage_ms: 0,
      ...hubBadgeBreakdownForUser(userId),
    });
  } else {
    payload = await getCachedOwnerHubBadge(userId, async () => {
      const built = await buildOwnerHubBadgePayloadWithMeta(sbAny, storesSb, userId);
      hubBreakdown = built.breakdown;
      return built.payload;
    });
    badgeMeta = {
      queryType: "owner_hub_badge_light",
      aggregateFallbackUsed: 0,
      aggregateRemovedSuccess: 1,
      existsQueryUsed: 1,
    };
  }
  const badgeAggregateMs = devPerfNow() - build0;
  const hubBuildMs = hubBreakdown?.total_ms ?? Math.round(badgeAggregateMs);
  const cache_set_ms =
    ttlCacheHit ? 0 : Math.max(0, Math.round(badgeAggregateMs - hubBuildMs));
  const unreadPartsMeta = peekLastUnreadPartsComputeMeta();
  const unreadPartsMs =
    hubBreakdown?.unread_parts_ms ?? unreadPartsMeta?.total_ms ?? 0;
  const unreadPartsVia = unreadPartsMeta?.via ?? "unknown";
  const findHubStoreMs = hubBreakdown?.find_hub_store_ms ?? 0;
  const cmUnreadMs = hubBreakdown?.cm_unread_ms ?? 0;
  const storeAttentionMs = hubBreakdown?.store_attention_total_ms ?? 0;

  const totalRouteMs = Math.round(devPerfNow() - t0);
  const hubBadgeDeferred =
    request.headers.get("x-samarket-hub-badge-deferred") === "1" ||
    request.headers.get("x-samarket-first-paint-blocking") === "0";
  const singleflightHit = inFlightBefore ? 1 : 0;
  logRoutePerf({
    route: "/api/me/store-owner-hub-badge",
    total_ms: totalRouteMs,
    db_ms: ttlCacheHit ? 0 : Math.round(badgeAggregateMs),
    cache_hit: ttlCacheHit ? 1 : 0,
    auth_ms: authMs,
    serialize_ms: 0,
    store_query_ms: Math.round(storesClientMs),
    query_type: badgeMeta.queryType,
    aggregate_fallback_used: badgeMeta.aggregateFallbackUsed,
    aggregate_removed_success: badgeMeta.aggregateRemovedSuccess,
    exists_query_used: badgeMeta.existsQueryUsed,
    ...buildRoutePerfClientObservability({
      request,
      deferred: hubBadgeDeferred,
      firstPaintBlocking: !hubBadgeDeferred,
    }),
    ...buildRoutePerfDedupeFields({
      userId,
      dedupeKey: requestDedupeKey,
      inFlightHit: inFlightBefore,
      responseCacheHit: false,
      ttlCacheHit,
      queryType: badgeMeta.queryType,
      cacheHitReason: ttlCacheHit
        ? "hub_badge_memory_ttl"
        : bypassShortCache
          ? "cmFresh_bypass"
          : inFlightBefore
            ? undefined
            : "hub_badge_memory_miss",
      dedupeHitReason: inFlightBefore ? "hub_badge_singleflight" : undefined,
    }),
    hub_badge_ttl_ms: OWNER_HUB_BADGE_TTL_MS,
    hub_badge_route_cache_key: requestDedupeKey,
    unread_parts_ms: Math.round(unreadPartsMs),
    unread_parts_via: unreadPartsVia,
    ...(unreadPartsMeta?.unread_memory_hit != null
      ? { unread_memory_hit: unreadPartsMeta.unread_memory_hit }
      : {}),
    find_hub_store_ms: Math.round(findHubStoreMs),
    ...(hubBreakdown?.find_hub_store_via
      ? { find_hub_store_via: hubBreakdown.find_hub_store_via }
      : {}),
    cm_unread_ms: Math.round(cmUnreadMs),
    ...(hubBreakdown?.cm_unread_via ? { cm_unread_via: hubBreakdown.cm_unread_via } : {}),
    store_attention_ms: Math.round(storeAttentionMs),
    hub_worst_stage: hubBreakdown?.worst_stage,
    hub_worst_stage_ms: hubBreakdown?.worst_stage_ms,
  });

  logOwnerDashboardPerfV2(
    buildOwnerDashboardPerfV2({
      route: "/api/me/store-owner-hub-badge",
      total_ms: totalRouteMs,
      auth_ms: authMs,
      store_lookup_ms: Math.round(findHubStoreMs),
      unread_rpc_ms: Math.round(unreadPartsMs + cmUnreadMs),
      order_count_rpc_ms: Math.round(storeAttentionMs),
      cache_hit: ttlCacheHit ? 1 : 0,
      singleflight_hit: singleflightHit,
      first_paint_blocking: !hubBadgeDeferred,
      ...(hubBreakdown?.no_hub_fast_path ? { no_hub_fast_path: hubBreakdown.no_hub_fast_path } : {}),
      db_round_trips: ttlCacheHit ? 0 : hubBreakdown?.no_hub_fast_path ? 2 : 3,
      stages: [
        { stage: "unread_parts", ms: unreadPartsMs },
        { stage: "find_hub_store", ms: findHubStoreMs },
        { stage: "cm_unread", ms: cmUnreadMs },
        { stage: "store_attention", ms: storeAttentionMs },
      ],
    })
  );

  logDevApiPerf("/api/me/store-owner-hub-badge", {
    auth_session_ms: authMs,
    store_query_ms: Math.round(storesClientMs),
    badge_query_ms: Math.round(badgeAggregateMs),
    profile_query_ms: 0,
    supabase_query_ms: Math.round(badgeAggregateMs),
    payload_build_ms: Math.round(badgeAggregateMs),
    total_route_ms: Math.round(devPerfNow() - t0),
    cmFresh: cmFresh ? 1 : 0,
    hubBadgeBypass: hubBadgeBypass ? 1 : 0,
    bypass_short_cache: bypassShortCache ? 1 : 0,
    unread_parts_ms: Math.round(unreadPartsMs),
  });

  if (!ttlCacheHit) {
    logHubColdClientWallBreakdown(
      buildHubColdClientWallBreakdown({
        cache_hit: 0,
        server_actual_handler_ms: totalRouteMs,
        auth_ms: authMs,
        hub: hubBreakdown,
        cache_lookup_ms,
        cache_set_ms,
        server_build_ms: Math.round(badgeAggregateMs),
        singleflight_hit: singleflightHit,
        duplicate_inflight_join: inFlightBefore ? 1 : 0,
        hub_badge_deferred: hubBadgeDeferred,
      })
    );
  }

  return NextResponse.json(payload, {
    headers: {
      ...buildPerfMeasureResponseHeaders({
        actual_handler_ms: totalRouteMs,
        cache_hit: ttlCacheHit ? 1 : 0,
      }),
      ...buildSnapshotSignoffHeaders("hub-badge", hubBadgeSignoffObs(hubBreakdown, ttlCacheHit)),
    },
  });
}

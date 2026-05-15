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
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getCachedOwnerHubBadge, peekOwnerHubBadgeCacheHit } from "@/lib/chats/owner-hub-badge-cache";
import { buildOwnerHubBadgePayloadMerged } from "@/lib/chats/build-owner-hub-badge-payload";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { devPerfNow, logDevApiPerf } from "@/lib/dev/dev-api-perf-log";
import { logRoutePerf } from "@/lib/http/route-perf-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const t0 = devPerfNow();
  const url = new URL(request.url);
  const cmFresh = url.searchParams.get("cmFresh") === "1";
  const hubBadgeBypass = url.searchParams.get("hubBadgeBypass") === "1";
  /** prod: cmFresh → 짧은 캐시 bypass. dev-safe: cmFresh 만으로는 bypass 안 함 — `hubBadgeBypass=1` 필요 */
  const bypassShortCache = cmFresh && (!isDevSafeMode() || hubBadgeBypass);

  const parallel0 = devPerfNow();
  const [sb, userId] = await Promise.all([
    Promise.resolve(tryCreateSupabaseServiceClient()),
    getOptionalAuthenticatedUserId(),
  ]);
  const authMs = Math.round(devPerfNow() - parallel0);

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

  const stores0 = devPerfNow();
  const storesSb = tryGetSupabaseForStores();
  const storesClientMs = devPerfNow() - stores0;

  const hubMemoryHitBefore = !bypassShortCache && peekOwnerHubBadgeCacheHit(userId);
  const build0 = devPerfNow();
  const payload = bypassShortCache
    ? await buildOwnerHubBadgePayloadMerged(sbAny, storesSb, userId)
    : await getCachedOwnerHubBadge(userId, async () => buildOwnerHubBadgePayloadMerged(sbAny, storesSb, userId));
  const badgeAggregateMs = devPerfNow() - build0;

  const totalRouteMs = Math.round(devPerfNow() - t0);
  logRoutePerf({
    route: "/api/me/store-owner-hub-badge",
    total_ms: totalRouteMs,
    db_ms: Math.round(badgeAggregateMs),
    cache_hit: bypassShortCache ? 0 : hubMemoryHitBefore ? 1 : 0,
    auth_ms: authMs,
    serialize_ms: 0,
    store_query_ms: Math.round(storesClientMs),
  });

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
  });

  return NextResponse.json(payload);
}

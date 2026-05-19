/**
 * GET /api/me/store-owner-hub-badge 응답 단기 캐시.
 * `chatUnread`(거래)·`philifeChatUnread` 는 읽음 API와 별도 캐시(user-chat-unread-parts) TTL과 어긋날 수 있으므로,
 * 미읽음 관련 변경 시 invalidateOwnerHubBadgeCache 를 함께 호출한다.
 */
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateCommunityMessengerUnreadTotalCache } from "@/lib/community-messenger/community-messenger-unread-total";
import { invalidateHubStoreOrderUnreadMemory } from "@/lib/community-messenger/hub-store-order-unread-memory-cache";
import { invalidateHubStoreAttentionMemory } from "@/lib/stores/hub-store-attention-memory-cache";
import { invalidateOwnerHubStoreLookupCache } from "@/lib/chats/owner-hub-store-lookup-cache";
import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";

/** 짧은 서버 캐시 — 클라이언트 폴링·다중 탭과 겹쳐도 한 번 계산으로 흡수. 클라 최소 간격은 `lib/chats/owner-hub-badge-store.ts` `MIN_FETCH_GAP_MS` 와 맞춤 */
/** warm 요청 5~30ms 목표 — 무효화·cmFresh·클라 `MIN_FETCH_GAP_MS` 와 함께 조정 */
const HUB_BADGE_TTL_MS = 5_000;

export type OwnerHubBadgePayload = {
  ok: true;
  total: number;
  /** 거래 채팅(`/chats` 목록 범위) 미읽음 */
  chatUnread: number;
  /** `/community-messenger` 메신저 참가자 미읽음 */
  communityMessengerUnread: number;
  /** 필라이프·일반 DM 등 커뮤니티 계열 참가자 미읽음 */
  philifeChatUnread: number;
  socialChatUnread: number;
  storeOrderChatUnread: number;
  orderAttention: number;
  inquiryAttention: number;
  storesTabAttention: number;
  storeDeepLink: string | null;
};

const hubBadgeCache = new Map<string, { expiresAt: number; value: OwnerHubBadgePayload }>();

export function ownerHubBadgeRouteCacheKey(userId: string): string {
  return `owner-hub-badge:${userId.trim()}`;
}

function hubBadgeFlightKey(userId: string): string {
  return ownerHubBadgeRouteCacheKey(userId);
}

/** 라우트 `[route-perf]` in_flight_hit — TTL miss 후 동시 요청 합류 여부 */
export function peekOwnerHubBadgeInflight(userId: string): boolean {
  const k = userId.trim();
  if (!k) return false;
  return getSingleFlightPromise(hubBadgeFlightKey(k)) !== undefined;
}

/** 라우트 `[route-perf]` cache_hit — 메모리 TTL 엔트리 존재 여부(인플라이트 제외) */
export function peekOwnerHubBadgeCacheHit(userId: string): boolean {
  const k = userId.trim();
  if (!k) return false;
  const row = hubBadgeCache.get(k);
  return !!(row && row.expiresAt > Date.now());
}

export function invalidateOwnerHubBadgeCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  hubBadgeCache.delete(k);
  /** `getCachedUserChatUnreadParts` memory TTL(5s) 이 남아 `chatUnread` 만 오래된 값으로 남는 경우 방지(메신저 수신 직후 배지 정합) */
  invalidateUserChatUnreadCache(k);
  invalidateOwnerHubStoreLookupCache(k);
  invalidateCommunityMessengerUnreadTotalCache(k);
  invalidateHubStoreOrderUnreadMemory(k);
  invalidateHubStoreAttentionMemory();
}

function pruneExpiredHubBadgeCache(now: number) {
  for (const [key, entry] of hubBadgeCache) {
    if (entry.expiresAt <= now) hubBadgeCache.delete(key);
  }
  while (hubBadgeCache.size > 200) {
    const k = hubBadgeCache.keys().next().value;
    if (k === undefined) break;
    hubBadgeCache.delete(k);
  }
}

export async function getCachedOwnerHubBadge(
  userId: string,
  factory: () => Promise<OwnerHubBadgePayload>
): Promise<OwnerHubBadgePayload> {
  const cacheKey = userId.trim();
  if (!cacheKey) {
    return factory();
  }

  const now = Date.now();
  const cached = hubBadgeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    console.log("[hub-badge-cache-hit]", {
      route_cache_key: hubBadgeFlightKey(cacheKey),
      userId: cacheKey,
      ttl_remaining_ms: cached.expiresAt - now,
    });
    return cached.value;
  }

  pruneExpiredHubBadgeCache(now);

  console.log("[hub-badge-cache-miss]", {
    route_cache_key: hubBadgeFlightKey(cacheKey),
    userId: cacheKey,
  });
  return runSingleFlight(hubBadgeFlightKey(cacheKey), async () => {
    const again = hubBadgeCache.get(cacheKey);
    if (again && again.expiresAt > Date.now()) {
      return again.value;
    }
    const value = await factory();
    hubBadgeCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + HUB_BADGE_TTL_MS,
    });
    console.log("[hub-badge-cache-set]", {
      route_cache_key: hubBadgeFlightKey(cacheKey),
      userId: cacheKey,
      ttl_ms: HUB_BADGE_TTL_MS,
    });
    return value;
  });
}

export const OWNER_HUB_BADGE_TTL_MS = HUB_BADGE_TTL_MS;

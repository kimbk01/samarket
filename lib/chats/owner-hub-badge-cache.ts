/**
 * GET /api/me/store-owner-hub-badge 응답 단기 캐시.
 * `chatUnread`(거래)·`philifeChatUnread` 는 읽음 API와 별도 캐시(user-chat-unread-parts) TTL과 어긋날 수 있으므로,
 * 미읽음 관련 변경 시 invalidateOwnerHubBadgeCache 를 함께 호출한다.
 */
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";

/** 짧은 서버 캐시 — 클라이언트 폴링·다중 탭과 겹쳐도 한 번 계산으로 흡수. 클라 최소 간격은 `lib/chats/owner-hub-badge-store.ts` `MIN_FETCH_GAP_MS` 와 맞춤 */
/** 짧을수록 수신 직후 교차 지연 완화, 길수록 GET 부하 감소 — 무효화 누락 시에도 10s 내 자연 정합 */
const HUB_BADGE_TTL_MS = 10_000;

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
const hubBadgeFlights = new Map<string, Promise<OwnerHubBadgePayload>>();

export function invalidateOwnerHubBadgeCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  hubBadgeCache.delete(k);
  /** `getCachedUserChatUnreadParts` 4s TTL 이 남아 `chatUnread` 만 오래된 값으로 남는 경우 방지(메신저 수신 직후 배지 정합) */
  invalidateUserChatUnreadCache(k);
}

function pruneExpiredHubBadgeCache(now: number) {
  if (hubBadgeCache.size < 200) return;
  for (const [key, entry] of hubBadgeCache) {
    if (entry.expiresAt <= now) hubBadgeCache.delete(key);
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
    return cached.value;
  }

  const existingFlight = hubBadgeFlights.get(cacheKey);
  if (existingFlight) {
    return existingFlight;
  }

  pruneExpiredHubBadgeCache(now);

  const flight = factory()
    .then((value) => {
      hubBadgeCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + HUB_BADGE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      if (hubBadgeFlights.get(cacheKey) === flight) {
        hubBadgeFlights.delete(cacheKey);
      }
    });

  hubBadgeFlights.set(cacheKey, flight);
  return flight;
}

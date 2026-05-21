/**
 * PATCH/GET `rooms/[roomId]` — 동일 user·room 반복 시 participant membership SELECT 생략.
 * unread·bootstrap·realtime 계약과 무관(읽기 전용 캐시).
 */

export type MessengerRoomMembershipCacheReason =
  | "hit"
  | "miss_absent"
  | "miss_expired"
  | "seed_route_canonical";

type MembershipEntry = { canonicalRoomId: string; expiresAt: number };

const GLOBAL_MEMBERSHIP_CACHE_KEY = "__samarket_cm_room_membership_cache_v1__";
const GLOBAL_PERMISSION_INFLIGHT_KEY = "__samarket_cm_room_permission_inflight_v1__";

function getMembershipCacheMap(): Map<string, MembershipEntry> {
  const g = globalThis as unknown as Record<string, Map<string, MembershipEntry> | undefined>;
  if (!g[GLOBAL_MEMBERSHIP_CACHE_KEY]) {
    g[GLOBAL_MEMBERSHIP_CACHE_KEY] = new Map();
  }
  return g[GLOBAL_MEMBERSHIP_CACHE_KEY]!;
}

export const MESSENGER_ROOM_MEMBERSHIP_CACHE_TTL_MS = (() => {
  const n = Number(process.env.SAMARKET_CM_ROOM_MEMBERSHIP_CACHE_TTL_MS);
  if (Number.isFinite(n) && n >= 5_000 && n <= 120_000) return Math.floor(n);
  return 45_000;
})();

function trimText(s: string): string {
  return s.trim();
}

export function membershipCacheKey(userId: string, rawRoomId: string): string {
  return `${trimText(userId)}\x00${trimText(rawRoomId).toLowerCase()}`;
}

export type MessengerRoomMembershipCacheProbe = {
  hit: boolean;
  canonicalRoomId?: string;
  permission_query_ms: number;
  permission_cache_lookup_ms: number;
  permission_cache_reason: MessengerRoomMembershipCacheReason;
};

/** 캐시 적중 시 DB 없음 — `permission_query_ms` 는 0. */
export function probeMessengerRoomMembershipCache(
  userId: string,
  rawRoomId: string
): MessengerRoomMembershipCacheProbe {
  const t0 = performance.now();
  const key = membershipCacheKey(userId, rawRoomId);
  const ent = getMembershipCacheMap().get(key);
  const now = Date.now();
  const permission_cache_lookup_ms = Math.round(performance.now() - t0);
  if (ent && ent.expiresAt > now) {
    return {
      hit: true,
      canonicalRoomId: ent.canonicalRoomId,
      permission_query_ms: 0,
      permission_cache_lookup_ms,
      permission_cache_reason: "hit",
    };
  }
  return {
    hit: false,
    permission_query_ms: 0,
    permission_cache_lookup_ms,
    permission_cache_reason: ent ? "miss_expired" : "miss_absent",
  };
}

export function rememberMessengerRoomMembershipCache(
  userId: string,
  rawRoomId: string,
  canonicalRoomId: string
): void {
  const canon = trimText(canonicalRoomId);
  if (!canon) return;
  const expiresAt = Date.now() + MESSENGER_ROOM_MEMBERSHIP_CACHE_TTL_MS;
  const cache = getMembershipCacheMap();
  const key = membershipCacheKey(userId, rawRoomId);
  cache.set(key, { canonicalRoomId: canon, expiresAt });
  /** canonical id 로도 조회 — 라우트가 이미 UUID 인 경우 */
  if (rawRoomId.toLowerCase() !== canon.toLowerCase()) {
    cache.set(membershipCacheKey(userId, canon), { canonicalRoomId: canon, expiresAt });
  }
}

/** bootstrap·room GET 직후 PATCH permission 0~5ms — canonical 이미 확정된 경우 */
export function seedMessengerRoomMembershipFromRouteCanonical(
  userId: string,
  rawRouteRoomId: string,
  canonicalRoomId: string
): void {
  rememberMessengerRoomMembershipCache(userId, rawRouteRoomId, canonicalRoomId);
}

export function getPermissionCanonicalInflightMap<T>(): Map<string, Promise<T>> {
  const g = globalThis as unknown as Record<string, Map<string, Promise<T>> | undefined>;
  if (!g[GLOBAL_PERMISSION_INFLIGHT_KEY]) {
    g[GLOBAL_PERMISSION_INFLIGHT_KEY] = new Map();
  }
  return g[GLOBAL_PERMISSION_INFLIGHT_KEY]!;
}

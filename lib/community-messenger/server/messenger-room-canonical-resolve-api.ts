/**
 * CONTRACT — PATCH/GET room permission (canonical room id)
 * - Resolve via `messenger-room-canonical-resolve-core` only.
 * - DO NOT `import("@/lib/community-messenger/service")` on this path (~700ms bundle load).
 * - Membership cache: `globalThis` map in `messenger-room-membership-cache.ts`; seed after bootstrap/GET.
 * @see docs/messenger-mark-read-performance-lock.md
 */
import type { NextResponse } from "next/server";
import { jsonError } from "@/lib/http/api-route";
import {
  getPermissionCanonicalInflightMap,
  membershipCacheKey,
  probeMessengerRoomMembershipCache,
  rememberMessengerRoomMembershipCache,
  seedMessengerRoomMembershipFromRouteCanonical,
  type MessengerRoomMembershipCacheReason,
} from "@/lib/community-messenger/server/messenger-room-membership-cache";
import {
  resolveCommunityMessengerCanonicalRoomIdForUserWithBreakdown,
  type MessengerCanonicalPermissionSource,
  type ResolveCommunityMessengerCanonicalResult,
} from "@/lib/community-messenger/server/messenger-room-canonical-resolve-core";

export type MessengerRoomPermissionBreakdown = {
  permission_cache_lookup_ms: number;
  permission_db_query_ms: number;
  permission_profile_join_ms: number;
  permission_room_fetch_ms: number;
  permission_canonical_build_ms: number;
  permission_cache_store_ms: number;
  permission_source: MessengerCanonicalPermissionSource | "membership_cache";
  permission_cache_reason: MessengerRoomMembershipCacheReason;
};

export type MessengerRoomCanonicalResult =
  | ({
      ok: true;
      canonicalRoomId: string;
      rawRouteRoomId: string;
      permission_query_ms: number;
      membership_cache_hit: 0 | 1;
    } & MessengerRoomPermissionBreakdown)
  | ({
      ok: false;
      response: NextResponse;
      permission_query_ms: number;
      membership_cache_hit: 0 | 1;
    } & MessengerRoomPermissionBreakdown);

function cacheHitBreakdown(
  probe: ReturnType<typeof probeMessengerRoomMembershipCache>
): MessengerRoomPermissionBreakdown {
  return {
    permission_cache_lookup_ms: probe.permission_cache_lookup_ms,
    permission_db_query_ms: 0,
    permission_profile_join_ms: 0,
    permission_room_fetch_ms: 0,
    permission_canonical_build_ms: 0,
    permission_cache_store_ms: 0,
    permission_source: "membership_cache",
    permission_cache_reason: probe.permission_cache_reason,
  };
}

function breakdownFromResolve(
  probe: ReturnType<typeof probeMessengerRoomMembershipCache>,
  resolved: ResolveCommunityMessengerCanonicalResult
): MessengerRoomPermissionBreakdown {
  const b = resolved.breakdown;
  return {
    permission_cache_lookup_ms: probe.permission_cache_lookup_ms,
    permission_db_query_ms: b.permission_db_query_ms,
    permission_profile_join_ms: b.permission_profile_join_ms,
    permission_room_fetch_ms: b.permission_room_fetch_ms,
    permission_canonical_build_ms: b.permission_canonical_build_ms,
    permission_cache_store_ms: b.permission_cache_store_ms,
    permission_source: b.permission_source,
    permission_cache_reason: probe.permission_cache_reason,
  };
}

function runPermissionResolveSingleFlight(
  userId: string,
  raw: string
): Promise<ResolveCommunityMessengerCanonicalResult> {
  const key = membershipCacheKey(userId, raw);
  const map = getPermissionCanonicalInflightMap<ResolveCommunityMessengerCanonicalResult>();
  let flight = map.get(key);
  if (!flight) {
    flight = resolveCommunityMessengerCanonicalRoomIdForUserWithBreakdown(userId, raw).finally(() => {
      map.delete(key);
    });
    map.set(key, flight);
  }
  return flight;
}

/**
 * API `rooms/[roomId]/…` 경로에서 거래·레거시 id 를 `community_messenger_rooms.id` 로 통일한다.
 * 라우트별로 동일 분기·문구를 복붙하지 않도록 둔다.
 */
export async function messengerRoomCanonicalOrJsonError(
  userId: string,
  rawRoomId: string
): Promise<MessengerRoomCanonicalResult> {
  const raw = String(rawRoomId ?? "").trim();
  if (!raw) {
    return {
      ok: false,
      response: jsonError("roomId가 필요합니다.", 400),
      permission_query_ms: 0,
      membership_cache_hit: 0,
      permission_cache_lookup_ms: 0,
      permission_db_query_ms: 0,
      permission_profile_join_ms: 0,
      permission_room_fetch_ms: 0,
      permission_canonical_build_ms: 0,
      permission_cache_store_ms: 0,
      permission_source: "bad_request",
      permission_cache_reason: "miss_absent",
    };
  }

  const tPerm0 = performance.now();
  const probe = probeMessengerRoomMembershipCache(userId, raw);
  if (probe.hit && probe.canonicalRoomId) {
    return {
      ok: true,
      canonicalRoomId: probe.canonicalRoomId,
      rawRouteRoomId: raw,
      permission_query_ms: Math.round(performance.now() - tPerm0),
      membership_cache_hit: 1,
      ...cacheHitBreakdown(probe),
    };
  }

  const resolved = await runPermissionResolveSingleFlight(userId, raw);
  const permission_query_ms = Math.round(performance.now() - tPerm0);
  const breakdown = breakdownFromResolve(probe, resolved);

  if (!resolved.ok) {
    if (resolved.error === "bad_request") {
      return {
        ok: false,
        response: jsonError("roomId가 필요합니다.", 400),
        permission_query_ms,
        membership_cache_hit: 0,
        ...breakdown,
      };
    }
    return {
      ok: false,
      response: jsonError("대화방을 찾을 수 없습니다.", 404, { code: resolved.error }),
      permission_query_ms,
      membership_cache_hit: 0,
      ...breakdown,
    };
  }

  rememberMessengerRoomMembershipCache(userId, raw, resolved.canonicalRoomId);
  const afterProbe = probeMessengerRoomMembershipCache(userId, raw);
  return {
    ok: true,
    canonicalRoomId: resolved.canonicalRoomId,
    rawRouteRoomId: raw,
    permission_query_ms,
    membership_cache_hit: afterProbe.hit ? 1 : 0,
    ...breakdown,
    permission_cache_reason: afterProbe.permission_cache_reason,
  };
}

/** bootstrap·room GET 성공 직후 membership 캐시 seed (다음 PATCH permission ≤5ms). */
export { seedMessengerRoomMembershipFromRouteCanonical };

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import { rememberMessengerRoomMembershipCache } from "@/lib/community-messenger/server/messenger-room-membership-cache";

function trimText(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

export type MessengerCanonicalPermissionSource =
  | "membership_cache"
  | "participant_direct"
  | "room_exists_not_member"
  | "trade_bridge_participant"
  | "ensure_product_chat"
  | "dev_state"
  | "bad_request";

export type MessengerCanonicalResolveBreakdown = {
  permission_db_query_ms: number;
  permission_room_fetch_ms: number;
  permission_canonical_build_ms: number;
  permission_profile_join_ms: number;
  permission_cache_store_ms: number;
  permission_source: MessengerCanonicalPermissionSource;
};

export type ResolveCommunityMessengerCanonicalResult =
  | { ok: true; canonicalRoomId: string; breakdown: MessengerCanonicalResolveBreakdown }
  | { ok: false; error: "bad_request" | "room_not_found"; breakdown: MessengerCanonicalResolveBreakdown };

function emptyBreakdown(
  source: MessengerCanonicalPermissionSource
): MessengerCanonicalResolveBreakdown {
  return {
    permission_db_query_ms: 0,
    permission_room_fetch_ms: 0,
    permission_canonical_build_ms: 0,
    permission_profile_join_ms: 0,
    permission_cache_store_ms: 0,
    permission_source: source,
  };
}

/**
 * API·Realtime bump 가 항상 `community_messenger_rooms.id`(원장 UUID)를 쓰도록 URL `roomId` 를 단일화한다.
 * `service.ts` 전체를 로드하지 않도록 분리(permission cold path).
 */
export async function resolveCommunityMessengerCanonicalRoomIdForUserWithBreakdown(
  userId: string,
  roomId: string
): Promise<ResolveCommunityMessengerCanonicalResult> {
  const id = trimText(roomId);
  if (!id) {
    return { ok: false, error: "bad_request", breakdown: emptyBreakdown("bad_request") };
  }

  let sb: ReturnType<typeof getSupabaseServer> | null = null;
  try {
    sb = getSupabaseServer();
  } catch {
    sb = null;
  }

  if (!sb) {
    const scope = globalThis as {
      __samarketCommunityMessengerState?: { participants: { roomId: string; userId: string }[] };
    };
    const devOk = Boolean(
      scope.__samarketCommunityMessengerState?.participants.some(
        (p) => trimText(p.roomId) === id && trimText(p.userId) === userId
      )
    );
    if (devOk) {
      const tStore0 = performance.now();
      rememberMessengerRoomMembershipCache(userId, id, id);
      return {
        ok: true,
        canonicalRoomId: id,
        breakdown: {
          ...emptyBreakdown("dev_state"),
          permission_cache_store_ms: Math.round(performance.now() - tStore0),
        },
      };
    }
    return { ok: false, error: "room_not_found", breakdown: emptyBreakdown("dev_state") };
  }

  const tParticipant0 = performance.now();
  const { data: participantAt } = await (sb as any)
    .from("community_messenger_participants")
    .select("room_id")
    .eq("room_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  const permission_db_query_ms = Math.round(performance.now() - tParticipant0);
  const atRoom = trimText((participantAt as { room_id?: unknown } | null)?.room_id as string);
  if (atRoom) {
    const tStore0 = performance.now();
    rememberMessengerRoomMembershipCache(userId, id, atRoom);
    return {
      ok: true,
      canonicalRoomId: atRoom,
      breakdown: {
        permission_db_query_ms,
        permission_room_fetch_ms: 0,
        permission_canonical_build_ms: 0,
        permission_profile_join_ms: 0,
        permission_cache_store_ms: Math.round(performance.now() - tStore0),
        permission_source: "participant_direct",
      },
    };
  }

  const tRoom0 = performance.now();
  const { data: roomAtId } = await (sb as any)
    .from("community_messenger_rooms")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  const permission_room_fetch_ms = Math.round(performance.now() - tRoom0);
  if (roomAtId?.id) {
    return {
      ok: false,
      error: "room_not_found",
      breakdown: {
        permission_db_query_ms,
        permission_room_fetch_ms,
        permission_canonical_build_ms: 0,
        permission_profile_join_ms: 0,
        permission_cache_store_ms: 0,
        permission_source: "room_exists_not_member",
      },
    };
  }

  const tBuild0 = performance.now();
  const tradeResolved = await resolveProductChat(sb as never, id);
  const bridgedMessengerId = tradeResolved?.messengerRoomId ? trimText(tradeResolved.messengerRoomId) : "";
  if (bridgedMessengerId) {
    const { data: p2 } = await (sb as any)
      .from("community_messenger_participants")
      .select("room_id")
      .eq("room_id", bridgedMessengerId)
      .eq("user_id", userId)
      .maybeSingle();
    if (p2?.room_id) {
      const tStore0 = performance.now();
      rememberMessengerRoomMembershipCache(userId, id, bridgedMessengerId);
      return {
        ok: true,
        canonicalRoomId: bridgedMessengerId,
        breakdown: {
          permission_db_query_ms,
          permission_room_fetch_ms,
          permission_canonical_build_ms: Math.round(performance.now() - tBuild0),
          permission_profile_join_ms: 0,
          permission_cache_store_ms: Math.round(performance.now() - tStore0),
          permission_source: "trade_bridge_participant",
        },
      };
    }
  }

  const { ensureCommunityMessengerDirectRoomFromProductChat } = await import(
    "@/lib/community-messenger/service"
  );
  const bridged = await ensureCommunityMessengerDirectRoomFromProductChat(userId, id);
  const permission_canonical_build_ms = Math.round(performance.now() - tBuild0);
  if (bridged.ok && bridged.roomId) {
    const tStore0 = performance.now();
    rememberMessengerRoomMembershipCache(userId, id, bridged.roomId);
    return {
      ok: true,
      canonicalRoomId: bridged.roomId,
      breakdown: {
        permission_db_query_ms,
        permission_room_fetch_ms,
        permission_canonical_build_ms,
        permission_profile_join_ms: 0,
        permission_cache_store_ms: Math.round(performance.now() - tStore0),
        permission_source: "ensure_product_chat",
      },
    };
  }
  return {
    ok: false,
    error: "room_not_found",
    breakdown: {
      permission_db_query_ms,
      permission_room_fetch_ms,
      permission_canonical_build_ms,
      permission_profile_join_ms: 0,
      permission_cache_store_ms: 0,
      permission_source: bridgedMessengerId ? "trade_bridge_participant" : "room_exists_not_member",
    },
  };
}

/** @deprecated breakdown 없이 — 기존 호출부 호환 */
export async function resolveCommunityMessengerCanonicalRoomIdForUser(
  userId: string,
  roomId: string
): Promise<{ ok: true; canonicalRoomId: string } | { ok: false; error: "bad_request" | "room_not_found" }> {
  const r = await resolveCommunityMessengerCanonicalRoomIdForUserWithBreakdown(userId, roomId);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, canonicalRoomId: r.canonicalRoomId };
}

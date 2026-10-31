import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolveProductChat } from "@/lib/trade/resolve-product-chat";
import { rememberMessengerRoomMembershipCache } from "@/lib/community-messenger/server/messenger-room-membership-cache";
import {
  loadMessengerRoomAccess,
  type MessengerRoomAccessFacts,
} from "@/lib/community-messenger/server/messenger-room-access";

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
  | {
      ok: true;
      canonicalRoomId: string;
      /** 1-B: canonicalRoomId 와 같은 방의 접근 행 (DB 함수로 읽었을 때만). 진입 게이트가 다시 읽지 않도록 넘긴다. */
      access?: MessengerRoomAccessFacts;
      breakdown: MessengerCanonicalResolveBreakdown;
    }
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
 * P2-7 — membership 캐시 적중 시 1회 재확인 (인덱스 단건 조회).
 * kick·ban·leave 는 모두 `left_at` 을 기록하므로, 다른 인스턴스에서 회수된 권한도 다음 요청에서 바로 거부된다.
 * stillMember null = 확인 불가(서버 클라이언트 없음 = dev state) → 호출부는 기존 캐시 판정 유지.
 * 1-B: 같은 1회 조회로 방 접근 행(access)도 받아 진입 게이트가 다시 읽지 않게 한다. 판정은 left_at 기준 그대로.
 */
export async function recheckActiveMessengerParticipant(
  userId: string,
  canonicalRoomId: string
): Promise<{ stillMember: boolean | null; access: MessengerRoomAccessFacts | null }> {
  const uid = trimText(userId);
  const rid = trimText(canonicalRoomId);
  if (!uid || !rid) return { stillMember: false, access: null };
  let sb: ReturnType<typeof getSupabaseServer> | null = null;
  try {
    sb = getSupabaseServer();
  } catch {
    sb = null;
  }
  if (!sb) return { stillMember: null, access: null };
  const access = await loadMessengerRoomAccess(sb, uid, rid);
  if (access) return { stillMember: access.participantActive, access };
  const { data, error } = await (sb as any)
    .from("community_messenger_participants")
    .select("room_id")
    .eq("room_id", rid)
    .eq("user_id", uid)
    .is("left_at", null)
    .maybeSingle();
  if (error) return { stillMember: false, access: null };
  return { stillMember: Boolean(trimText((data as { room_id?: unknown } | null)?.room_id as string)), access: null };
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
  /** 1-B: 참가·방 종류·(그룹) 강퇴·활성 멤버를 1회로. null(읽기 실패)이면 기존 개별 조회. */
  const access = await loadMessengerRoomAccess(sb, userId, id);
  let atRoom = "";
  let roomExists = false;
  let roomType = "";
  if (access) {
    atRoom = access.participantActive ? id : "";
    roomExists = access.roomExists;
    roomType = access.roomType;
  } else {
    const [{ data: participantAt }, { data: roomMetaAt }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("room_id")
        .eq("room_id", id)
        .eq("user_id", userId)
        .is("left_at", null) // SEC-06: 떠난 멤버(left_at set)는 멤버로 재해석하지 않는다. 재입장 시 left_at=null 로 복원됨.
        .maybeSingle(),
      (sb as any).from("community_messenger_rooms").select("id, room_type").eq("id", id).maybeSingle(),
    ]);
    atRoom = trimText((participantAt as { room_id?: unknown } | null)?.room_id as string);
    roomExists = Boolean((roomMetaAt as { id?: unknown } | null)?.id);
    roomType = trimText((roomMetaAt as { room_type?: unknown } | null)?.room_type);
  }
  const permission_db_query_ms = Math.round(performance.now() - tParticipant0);
  const isGroupRoom = roomType === "private_group" || roomType === "open_group";

  if (atRoom) {
    // GROUP: participant row alone is insufficient — require active membership.
    if (isGroupRoom) {
      // access 가 있으면 assertActiveGroupMembershipIfGroup 와 같은 조건(활성 강퇴 없음 + 활성·숨김 아닌 참가 행)을 같은 행으로 판정
      let gateOk: boolean;
      if (access) {
        gateOk = !access.banned && access.groupParticipant != null;
      } else {
        const { assertActiveGroupMembershipIfGroup } = await import(
          "@/lib/community-messenger/group/group-active-membership-gate"
        );
        const gate = await assertActiveGroupMembershipIfGroup({
          userId,
          roomId: atRoom,
          supabase: sb,
          roomType,
        });
        gateOk = gate.ok;
      }
      if (!gateOk) {
        return {
          ok: false,
          error: "room_not_found",
          breakdown: {
            permission_db_query_ms,
            permission_room_fetch_ms: 0,
            permission_canonical_build_ms: 0,
            permission_profile_join_ms: 0,
            permission_cache_store_ms: 0,
            permission_source: "room_exists_not_member",
          },
        };
      }
    }
    const tStore0 = performance.now();
    rememberMessengerRoomMembershipCache(userId, id, atRoom);
    return {
      ok: true,
      canonicalRoomId: atRoom,
      ...(access ? { access } : {}),
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

  const permission_room_fetch_ms = 0;
  if (roomExists) {
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
      .is("left_at", null) // SEC-06: 떠난 멤버는 멤버로 재해석하지 않는다.
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

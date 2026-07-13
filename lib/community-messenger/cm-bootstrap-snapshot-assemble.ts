/**
 * CMB1 bootstrap snapshot assembly — CPU-only from precomputed RPC payload.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  buildParticipantsByRoomMap,
  buildProfilesFromKnownRelations,
  acceptedPeerIdsFromCommunityFriendRows,
  friendshipAcceptedAtByPeerFromRows,
  buildCommunityMessengerFriendRequestsFromProfileMap,
  hydrateProfilesLabelsOnlyWithMap,
  summarizeRoomsBatchWithProfileMap,
  dedupeParticipantUserIds,
} from "@/lib/community-messenger/service";
import { enrichTradeRoomClassificationForDeferredHomeSync } from "@/lib/community-messenger/trade-chat-list/trade-room-classification-enrich";
import {
  enrichMessengerTradeUnreadWithLegacyTrade,
  type Hs5LegacyLoadResult,
} from "@/lib/community-messenger/enrich-messenger-trade-unread-with-legacy-trade";
import {
  peekBootstrapLiteSocialDeferred,
  scheduleBootstrapLiteSocialGraphBackgroundHydration,
} from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerProfileLite,
} from "@/lib/community-messenger/types";
import { isCommunityMessengerPrivateGroupListRoomType } from "@/lib/community-messenger/types";
import { CM_BOOTSTRAP_LITE_DEFAULT_LIMIT } from "@/lib/community-messenger/cm-bootstrap-snapshot-counter";

export type CmBootstrapSnapshotPayloadJson = {
  ok?: boolean;
  error?: string;
  rooms?: unknown[];
  unread_snapshot?: {
    hs5?: { chatRows?: unknown[]; pcRows?: unknown[] };
    participants?: unknown[];
  };
  room_summaries?: unknown[];
  latest_messages?: unknown[];
  lite_bundle?: {
    membership_total_count?: number;
    room_ids?: unknown[];
    rooms?: unknown[];
    participants?: unknown[];
    profile_labels?: Record<string, unknown> | null;
  };
  hs5?: {
    chatRows?: unknown[];
    pcRows?: unknown[];
  };
  next_cursor?: string | null;
  snapshot_version?: number;
  list_limit?: number;
  updated_at?: string;
};

function trimText(v: unknown): string {
  return String(v ?? "").trim();
}

function parseProfileLabels(raw: unknown): Map<string, {
  id: string;
  display_name: string | null;
  nickname: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: null;
}> {
  const out = new Map<string, {
    id: string;
    display_name: string | null;
    nickname: string | null;
    username: string | null;
    avatar_url: string | null;
    bio: null;
  }>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const row = val as Record<string, unknown>;
    const id = trimText(row.id ?? key);
    if (!id) continue;
    out.set(id, {
      id,
      display_name: (row.display_name as string | null) ?? null,
      nickname: (row.nickname as string | null) ?? null,
      username: (row.username as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      bio: null,
    });
  }
  return out;
}

function parseLiteBundle(payload: CmBootstrapSnapshotPayloadJson) {
  const raw = payload.lite_bundle;
  if (!raw || typeof raw !== "object") return null;

  const roomRows = (Array.isArray(raw.rooms) ? raw.rooms : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      room_type: (r.room_type ?? "direct") as "direct" | "private_group" | "open_group",
      room_status: (r.room_status ?? "active") as "active" | "archived",
      is_readonly: r.is_readonly === true,
      title: (r.title as string | null) ?? null,
      summary: null,
      avatar_url: null,
      created_by: null,
      direct_key:
        r.direct_key != null && typeof r.direct_key === "string"
          ? r.direct_key.trim() || null
          : r.direct_key != null
            ? String(r.direct_key).trim() || null
            : null,
      last_message: (r.last_message as string | null) ?? null,
      last_message_at: (r.last_message_at as string | null) ?? null,
      last_message_type: (r.last_message_type ?? "text") as "text" | "image" | "file" | "system",
    };
  });

  const participantRows = (Array.isArray(raw.participants) ? raw.participants : []).map((row) => {
    const r = row as Record<string, unknown>;
    const roomId = String(r.room_id ?? "");
    const uid = String(r.user_id ?? "");
    return {
      id: `${roomId}:${uid}`,
      room_id: roomId,
      user_id: uid,
      role: "member" as const,
      unread_count: Number(r.unread_count ?? 0),
      is_muted: r.is_muted === true,
      is_pinned: r.is_pinned === true,
      is_archived: r.is_archived === true,
      joined_at: null,
    };
  });

  return {
    roomRows,
    participantRows,
    profileLabels: parseProfileLabels(raw.profile_labels),
  };
}

function hs5FromSnapshot(payload: CmBootstrapSnapshotPayloadJson): Hs5LegacyLoadResult {
  const hs5 = payload.hs5 ?? payload.unread_snapshot?.hs5 ?? {};
  const chatRows = Array.isArray(hs5.chatRows) ? hs5.chatRows : [];
  const pcRows = Array.isArray(hs5.pcRows) ? hs5.pcRows : [];
  return {
    itemTradeRows: chatRows,
    pcRows,
    itErr: null,
    usedRpcBundle: true,
    dbRoundTrips: 0,
    legacyChatRoomsFetchMs: 0,
    legacyProductChatsFetchMs: 0,
    unreadLegacyFetchPath: "rpc_bundle",
    unreadRpcBundleMs: 0,
  };
}

function dedupeIds(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const id = trimText(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function getSupabaseOrNull(): ReturnType<typeof getSupabaseServer> | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

export function parseCmBootstrapSnapshotRpcData(data: unknown): CmBootstrapSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as CmBootstrapSnapshotPayloadJson;
}

export function cmBootstrapSnapshotGateFromPayload(
  payload: CmBootstrapSnapshotPayloadJson
): { ok: true } | { ok: false; error: string } {
  if (payload.ok === false) {
    return { ok: false, error: String(payload.error ?? "invalid_snapshot") };
  }
  if (payload.ok !== true && !payload.lite_bundle) {
    return { ok: false, error: "invalid_snapshot" };
  }
  return { ok: true };
}

/** Assemble lite bootstrap JSON from snapshot — zero DB RTT after RPC/counter read. */
export async function assembleLiteBootstrapFromSnapshotPayload(
  userId: string,
  payload: CmBootstrapSnapshotPayloadJson
): Promise<CommunityMessengerBootstrap | null> {
  const gate = cmBootstrapSnapshotGateFromPayload(payload);
  if (!gate.ok) return null;

  const parsed = parseLiteBundle(payload);
  if (!parsed) return null;

  const limit = Math.min(
    CM_BOOTSTRAP_LITE_DEFAULT_LIMIT,
    Math.max(1, Math.floor(Number(payload.list_limit) || CM_BOOTSTRAP_LITE_DEFAULT_LIMIT))
  );
  const roomRows =
    parsed.roomRows.length > limit ? parsed.roomRows.slice(0, limit) : parsed.roomRows;
  const allow = new Set(roomRows.map((r) => r.id));
  const participantRows = parsed.participantRows.filter((p) => allow.has(p.room_id));
  const byRoomId = buildParticipantsByRoomMap(participantRows);

  const socialPeek = peekBootstrapLiteSocialDeferred(userId);
  const acceptedFriendRows = socialPeek.snapshot?.acceptedFriendRows ?? [];
  const favoriteFriendIds = socialPeek.snapshot?.favoriteFriendIds ?? [];
  const followingIds = socialPeek.snapshot?.followingIds ?? [];
  const hiddenIds = socialPeek.snapshot?.hiddenIds ?? [];
  const blockedIds = socialPeek.snapshot?.blockedIds ?? [];
  const requestRows = socialPeek.snapshot?.requestRows ?? [];

  if (!socialPeek.snapshot) {
    scheduleBootstrapLiteSocialGraphBackgroundHydration(userId, async () => {
      const { fetchBootstrapLiteSocialGraphSnapshot } = await import(
        "@/lib/community-messenger/service"
      );
      return fetchBootstrapLiteSocialGraphSnapshot(userId);
    });
  }

  const friendIds = acceptedPeerIdsFromCommunityFriendRows(userId, acceptedFriendRows);
  const friendshipAcceptedAtByPeer = friendshipAcceptedAtByPeerFromRows(userId, acceptedFriendRows);

  const liteProfileHydrateIds = dedupeIds([
    userId,
    ...dedupeParticipantUserIds(participantRows),
  ]);

  const { members, profileMap } = await hydrateProfilesLabelsOnlyWithMap(userId, liteProfileHydrateIds, {
    includeSelf: true,
    prefetchedProfiles: parsed.profileLabels,
    bootstrapLiteFirstPaint: true,
  });

  const allProfiles = buildProfilesFromKnownRelations({
    viewerId: userId,
    targetIds: liteProfileHydrateIds,
    profileMap,
    friendIds,
    favoriteFriendIds,
    followingIds,
    hiddenIds,
    blockedIds,
    friendshipAcceptedAtByPeer,
  });
  const profileById = new Map(allProfiles.map((profile) => [profile.id, profile]));

  const mySummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    roomRows,
    new Map(),
    byRoomId,
    profileById
  );

  /**
   * Lite tier 거래 분류 parity — critical(`assembleCriticalBootstrapFromSnapshotPayload`)·full 과 동일하게
   * peer-pair/product_chats/item_trade ledger 기반 trade 확정을 lite context_meta 에 반영한다.
   * lite snapshot payload 에는 `trade_context` 프리컴퓨트가 없어 미분류 direct 방이 null 로 남던 것을 보강.
   * 이미 trade 인 방은 함수 내부에서 보존되고, 일반 friend·delivery·group·commerce direct_key·
   * 타 CM 방 FK product_chat 은 제외한다(오분류 방지 유지). 추가 쿼리는 미분류 direct 방이 있을 때만.
   */
  const sbBoot = getSupabaseOrNull();
  if (sbBoot) {
    await enrichTradeRoomClassificationForDeferredHomeSync(sbBoot as never, userId, mySummaries);
  }

  await enrichMessengerTradeUnreadWithLegacyTrade(
    null as never,
    userId,
    mySummaries,
    undefined,
    undefined,
    { preloadedLegacy: hs5FromSnapshot(payload) }
  ).catch(() => {});

  const chats = mySummaries.filter((room) => room.roomType === "direct");
  const groups = mySummaries.filter((room) => isCommunityMessengerPrivateGroupListRoomType(room.roomType));

  const me = profileById.get(userId) ?? members.find((m) => m.id === userId) ?? null;
  const hiddenIdSet = new Set(
    hiddenIds
      .map((id) => profileById.get(id))
      .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile))
      .map((profile) => profile.id)
  );
  const friends = friendIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile))
    .map((profile) => ({
      ...profile,
      friendshipAcceptedAt: friendshipAcceptedAtByPeer.get(profile.id) ?? null,
    }));

  return {
    me,
    tabs: {
      friends: friends.filter((profile) => !hiddenIdSet.has(profile.id)).length,
      chats: chats.length,
      groups: groups.length,
      calls: 0,
    },
    friends,
    following: followingIds
      .map((id) => profileById.get(id))
      .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile)),
    hidden: hiddenIds
      .map((id) => profileById.get(id))
      .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile)),
    blocked: blockedIds
      .map((id) => profileById.get(id))
      .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile)),
    requests: buildCommunityMessengerFriendRequestsFromProfileMap(
      userId,
      requestRows as unknown as Parameters<typeof buildCommunityMessengerFriendRequestsFromProfileMap>[1],
      profileMap
    ),
    chats,
    groups,
    discoverableGroups: [],
    calls: [],
    deferredCallLog: true as const,
  };
}

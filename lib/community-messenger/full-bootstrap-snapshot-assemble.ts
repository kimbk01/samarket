/**
 * FBT1 full bootstrap snapshot assembly — CPU-only from precomputed RPC payload.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  acceptedPeerIdsFromCommunityFriendRows,
  buildBootstrapCallsFromPreloadedSnapshot,
  buildCommunityMessengerFriendRequestsFromProfileMap,
  buildParticipantsByRoomMap,
  buildProfilesFromKnownRelations,
  dedupeParticipantUserIds,
  enrichTradeContextForBootstrapSnapshot,
  friendshipAcceptedAtByPeerFromRows,
  hydrateProfilesLabelsOnlyWithMap,
  participantRowUserId,
  profileLabel,
  sliceGroupParticipantsForRoomBootstrap,
  summarizeRoomsBatchWithProfileMap,
} from "@/lib/community-messenger/service";
import { applyCommerceLifecycleFromSnapshotPayload } from "@/lib/community-messenger/home-sync-snapshot-commerce-lifecycle-apply";
import type { HomeSyncSnapshotPayloadJson } from "@/lib/community-messenger/home-sync-snapshot-assemble";
import { enrichTradeRoomClassificationForDeferredHomeSync } from "@/lib/community-messenger/trade-chat-list/trade-room-classification-enrich";
import {
  enrichMessengerTradeUnreadWithLegacyTrade,
  type Hs5LegacyLoadResult,
} from "@/lib/community-messenger/enrich-messenger-trade-unread-with-legacy-trade";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
  CommunityMessengerCriticalParticipantLabel,
  CommunityMessengerCriticalRoomRow,
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
  CommunityMessengerRoomType,
} from "@/lib/community-messenger/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommunityMessengerPrivateGroupListRoomType } from "@/lib/community-messenger/types";
import {
  FBT1_CRITICAL_DEFAULT_LIMIT,
  FBT1_FULL_DEFAULT_LIMIT,
} from "@/lib/community-messenger/full-bootstrap-snapshot-counter";
import { listBootstrapAcceptedFriendRowsFromSsot } from "@/lib/community-messenger/friendship/bootstrap-accepted-friend-rows-from-ssot";

export type FullBootstrapSnapshotPayloadJson = {
  ok?: boolean;
  error?: string;
  tier?: string;
  rooms?: unknown[];
  unread_snapshot?: {
    hs5?: { chatRows?: unknown[]; pcRows?: unknown[] };
    participants?: unknown[];
  };
  lite_bundle?: Record<string, unknown>;
  hs5?: { chatRows?: unknown[]; pcRows?: unknown[] };
  social_graph?: Record<string, unknown>;
  discoverable?: Record<string, unknown>;
  trade_context?: unknown;
  order_context?: unknown;
  notification_context?: unknown;
  attachment_meta?: unknown;
  call_logs?: unknown[];
  call_session_participants?: unknown[];
  meetings?: unknown[];
  profile_labels_expanded?: Record<string, unknown>;
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
  dibay_id: string | null;
  avatar_url: string | null;
  bio: string | null;
}> {
  const out = new Map<string, {
    id: string;
    display_name: string | null;
    nickname: string | null;
    username: string | null;
    dibay_id: string | null;
    avatar_url: string | null;
    bio: string | null;
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
      dibay_id: (row.dibay_id as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      bio: (row.bio as string | null) ?? null,
    });
  }
  return out;
}

function parseLiteBundle(payload: FullBootstrapSnapshotPayloadJson) {
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

  const profileSource = payload.profile_labels_expanded ?? raw.profile_labels;
  return {
    roomRows,
    participantRows,
    profileLabels: parseProfileLabels(profileSource),
  };
}

function commerceLifecycleFromOrderContext(payload: FullBootstrapSnapshotPayloadJson): HomeSyncSnapshotPayloadJson {
  const raw = payload.order_context;
  const store_orders =
    raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray((raw as { store_orders?: unknown }).store_orders)
      ? ((raw as { store_orders: unknown[] }).store_orders as Array<Record<string, unknown>>)
      : [];
  return {
    commerce_lifecycle: {
      product_chats: [],
      store_orders,
      order_completed_events: [],
    },
  };
}

function hs5FromSnapshot(payload: FullBootstrapSnapshotPayloadJson): Hs5LegacyLoadResult {
  const hs5 = payload.hs5 ?? payload.unread_snapshot?.hs5 ?? {};
  return {
    itemTradeRows: Array.isArray(hs5.chatRows) ? hs5.chatRows : [],
    pcRows: Array.isArray(hs5.pcRows) ? hs5.pcRows : [],
    itErr: null,
    usedRpcBundle: true,
    dbRoundTrips: 0,
    legacyChatRoomsFetchMs: 0,
    legacyProductChatsFetchMs: 0,
    unreadLegacyFetchPath: "rpc_bundle",
    unreadRpcBundleMs: 0,
  };
}

function getSupabaseOrNull(): ReturnType<typeof getSupabaseServer> | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
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

function roomRowType(room: { room_type?: unknown }): CommunityMessengerRoomType {
  const t = room.room_type as string | undefined;
  return (t === "direct" || t === "private_group" || t === "open_group" ? t : "direct") as CommunityMessengerRoomType;
}

export function parseFullBootstrapSnapshotRpcData(data: unknown): FullBootstrapSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as FullBootstrapSnapshotPayloadJson;
}

export function fullBootstrapSnapshotGateFromPayload(
  payload: FullBootstrapSnapshotPayloadJson
): { ok: true } | { ok: false; error: string } {
  if (payload.ok === false) {
    return { ok: false, error: String(payload.error ?? "invalid_snapshot") };
  }
  if (payload.ok !== true && !payload.lite_bundle) {
    return { ok: false, error: "invalid_snapshot" };
  }
  return { ok: true };
}

export function summaryToCriticalRow(
  summary: CommunityMessengerRoomSummary,
  participant_labels_minimal: CommunityMessengerCriticalParticipantLabel[]
): CommunityMessengerCriticalRoomRow {
  return {
    room_id: summary.id,
    room_type: summary.roomType,
    direct_key: summary.messengerDirectKey ?? null,
    title: summary.title,
    avatar_url: summary.avatarUrl,
    avatar_ref: null,
    last_message_preview: summary.lastMessage,
    last_message_at: summary.lastMessageAt,
    unread_count: summary.unreadCount,
    participant_labels_minimal,
    context_meta: summary.contextMeta ?? null,
    group_meta:
      summary.roomType !== "direct"
        ? {
            member_count: summary.memberCount,
            member_limit: summary.memberLimit,
            is_discoverable: summary.isDiscoverable,
            join_policy: summary.joinPolicy,
          }
        : null,
  };
}

export async function assembleCriticalBootstrapFromSnapshotPayload(
  userId: string,
  payload: FullBootstrapSnapshotPayloadJson,
  sbAny?: SupabaseClient<any> | null
): Promise<CommunityMessengerBootstrapCritical | null> {
  const gate = fullBootstrapSnapshotGateFromPayload(payload);
  if (!gate.ok) return null;

  const parsed = parseLiteBundle(payload);
  if (!parsed) return null;

  const limit = Math.min(
    FBT1_CRITICAL_DEFAULT_LIMIT,
    Math.max(1, Math.floor(Number(payload.list_limit) || FBT1_CRITICAL_DEFAULT_LIMIT))
  );
  const roomRows = parsed.roomRows.length > limit ? parsed.roomRows.slice(0, limit) : parsed.roomRows;
  const allow = new Set(roomRows.map((r) => r.id));
  const participantRows = parsed.participantRows.filter((p) => allow.has(p.room_id));
  const byRoomId = buildParticipantsByRoomMap(participantRows);

  const participantSliceByRoom = new Map<string, (typeof participantRows)[number][]>();
  for (const room of roomRows) {
    const parts = byRoomId.get(room.id) ?? [];
    const rt = roomRowType(room);
    const sliceRows =
      rt === "direct"
        ? parts
        : sliceGroupParticipantsForRoomBootstrap(parts, userId, 8).rows;
    participantSliceByRoom.set(room.id, sliceRows as (typeof participantRows)[number][]);
  }

  const hydrateIds = new Set<string>([userId]);
  for (const room of roomRows) {
    for (const p of participantSliceByRoom.get(room.id) ?? []) {
      const uid = participantRowUserId(p);
      if (uid) hydrateIds.add(uid);
    }
  }

  const { members } = await hydrateProfilesLabelsOnlyWithMap(userId, Array.from(hydrateIds), {
    includeSelf: true,
    prefetchedProfiles: parsed.profileLabels,
    bootstrapLiteFirstPaint: true,
  });
  const profileById = new Map(members.map((m) => [m.id, m]));

  const mySummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    roomRows,
    new Map(),
    byRoomId,
    profileById
  );

  const sbBoot = sbAny ?? getSupabaseOrNull();
  if (sbBoot) {
    await enrichTradeRoomClassificationForDeferredHomeSync(sbBoot as never, userId, mySummaries);
  }

  applyCommerceLifecycleFromSnapshotPayload(mySummaries, commerceLifecycleFromOrderContext(payload));

  await enrichMessengerTradeUnreadWithLegacyTrade(
    null as never,
    userId,
    mySummaries,
    undefined,
    undefined,
    { preloadedLegacy: hs5FromSnapshot(payload) }
  ).catch(() => {});

  const chats: CommunityMessengerCriticalRoomRow[] = [];
  const groups: CommunityMessengerCriticalRoomRow[] = [];
  for (const summary of mySummaries) {
    const sliceRows = participantSliceByRoom.get(summary.id) ?? [];
    const labels: CommunityMessengerCriticalParticipantLabel[] = [];
    const seen = new Set<string>();
    for (const p of sliceRows) {
      const uid = participantRowUserId(p);
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const prof = profileById.get(uid);
      labels.push({
        user_id: uid,
        label: prof?.label ?? profileLabel(null, uid),
        avatar_url: prof?.avatarUrl ?? null,
      });
    }
    const row = summaryToCriticalRow(summary, labels);
    if (summary.roomType === "direct") chats.push(row);
    else if (isCommunityMessengerPrivateGroupListRoomType(summary.roomType)) groups.push(row);
  }

  const me = profileById.get(userId) ?? null;
  return {
    tier: "critical",
    me: me ? { ...me, friendshipAcceptedAt: undefined } : null,
    chats,
    groups,
    tabs: { chats: chats.length, groups: groups.length },
  };
}

export async function assembleFullBootstrapFromSnapshotPayload(
  userId: string,
  payload: FullBootstrapSnapshotPayloadJson
): Promise<CommunityMessengerBootstrap | null> {
  const gate = fullBootstrapSnapshotGateFromPayload(payload);
  if (!gate.ok) return null;

  const parsed = parseLiteBundle(payload);
  if (!parsed) return null;

  const social = payload.social_graph ?? {};
  const acceptedFriendRows = await listBootstrapAcceptedFriendRowsFromSsot(userId);
  const favoriteFriendIds = (Array.isArray(social.favorite_friend_ids) ? social.favorite_friend_ids : []).map(String);
  const followingIds = (Array.isArray(social.following_neighbor) ? social.following_neighbor : []).map(String);
  const hiddenIds = (Array.isArray(social.following_hidden) ? social.following_hidden : []).map(String);
  const blockedIds = (Array.isArray(social.following_blocked) ? social.following_blocked : []).map(String);
  const requestRows = Array.isArray(social.friend_requests) ? social.friend_requests : [];

  const limit = Math.min(
    FBT1_FULL_DEFAULT_LIMIT,
    Math.max(1, Math.floor(Number(payload.list_limit) || FBT1_FULL_DEFAULT_LIMIT))
  );
  const roomRows = parsed.roomRows.length > limit ? parsed.roomRows.slice(0, limit) : parsed.roomRows;
  const allow = new Set(roomRows.map((r) => r.id));
  const participantRows = parsed.participantRows.filter((p) => allow.has(p.room_id));
  const byRoomId = buildParticipantsByRoomMap(participantRows);

  const disc = payload.discoverable ?? {};
  const discRoomRows = (Array.isArray(disc.rooms) ? disc.rooms : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      room_type: "open_group" as const,
      room_status: (r.room_status ?? "active") as "active" | "archived",
      is_readonly: r.is_readonly === true,
      title: (r.title as string | null) ?? null,
      summary: (r.summary as string | null) ?? null,
      avatar_url: (r.avatar_url as string | null) ?? null,
      created_by: (r.created_by as string | null) ?? null,
      direct_key: null,
      last_message: (r.last_message as string | null) ?? null,
      last_message_at: (r.last_message_at as string | null) ?? null,
      last_message_type: (r.last_message_type ?? "text") as "text" | "image" | "file" | "system",
      owner_user_id: r.owner_user_id,
      member_limit: r.member_limit,
      is_discoverable: r.is_discoverable,
      join_policy: r.join_policy,
      identity_policy: r.identity_policy,
      password_hash: r.password_hash,
      visibility: r.visibility,
    };
  });
  const discParticipantRows = (Array.isArray(disc.participants) ? disc.participants : []).map((row) => {
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
      joined_at: (r.joined_at as string | null) ?? null,
    };
  });
  const discByRoomId = buildParticipantsByRoomMap(discParticipantRows);
  const joinedRoomIds = new Set(
    (Array.isArray(disc.joined_room_ids) ? disc.joined_room_ids : []).map(String).filter(Boolean)
  );

  const callLogRows = (Array.isArray(payload.call_logs) ? payload.call_logs : []) as Array<
    Record<string, unknown>
  >;
  const callRows = callLogRows.map((r) => ({
    id: String(r.id ?? ""),
    session_id: (r.session_id as string | null) ?? null,
    room_id: (r.room_id as string | null) ?? null,
    caller_user_id: (r.caller_user_id as string | null) ?? null,
    peer_user_id: (r.peer_user_id as string | null) ?? null,
    call_kind: r.call_kind,
    status: r.status,
    duration_seconds: r.duration_seconds,
    started_at: r.started_at,
    ended_at: r.ended_at,
    sessionEndedAt: r.sessionEndedAt,
    sessionEndedReason: r.sessionEndedReason,
  }));

  const friendIds = acceptedPeerIdsFromCommunityFriendRows(userId, acceptedFriendRows as never);
  const friendshipAcceptedAtByPeer = friendshipAcceptedAtByPeerFromRows(userId, acceptedFriendRows as never);

  const allIds = dedupeIds([
    userId,
    ...friendIds,
    ...favoriteFriendIds,
    ...followingIds,
    ...hiddenIds,
    ...blockedIds,
    ...requestRows.flatMap((row) => {
      const r = row as Record<string, unknown>;
      return [String(r.requester_id ?? ""), String(r.addressee_id ?? "")];
    }),
    ...dedupeParticipantUserIds(participantRows),
    ...dedupeParticipantUserIds(discParticipantRows),
    ...callRows.flatMap((r) => [String(r.caller_user_id ?? ""), String(r.peer_user_id ?? "")]),
    ...(Array.isArray(payload.call_session_participants)
      ? payload.call_session_participants.map((row) => String((row as Record<string, unknown>).user_id ?? ""))
      : []),
  ]);

  const { profileMap } = await hydrateProfilesLabelsOnlyWithMap(userId, allIds, {
    includeSelf: true,
    prefetchedProfiles: parsed.profileLabels,
  });

  const allProfiles = buildProfilesFromKnownRelations({
    viewerId: userId,
    targetIds: allIds,
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

  await enrichTradeContextForBootstrapSnapshot(
    userId,
    mySummaries,
    payload.trade_context ?? {}
  );

  applyCommerceLifecycleFromSnapshotPayload(mySummaries, commerceLifecycleFromOrderContext(payload));

  await enrichMessengerTradeUnreadWithLegacyTrade(
    null as never,
    userId,
    mySummaries,
    undefined,
    undefined,
    { preloadedLegacy: hs5FromSnapshot(payload) }
  ).catch(() => {});

  const { enrichOpenGroupSummariesWithPhilifeMeetingLabels } = await import(
    "@/lib/community-messenger/philife-meeting-open-group-summaries"
  );
  await enrichOpenGroupSummariesWithPhilifeMeetingLabels(userId, mySummaries);

  const chats = mySummaries.filter((room) => room.roomType === "direct");
  const groups = mySummaries.filter((room) => isCommunityMessengerPrivateGroupListRoomType(room.roomType));

  const discSummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    discRoomRows as never,
    new Map(),
    discByRoomId,
    profileById
  );

  const meetingMetaByRoomId = new Map<
    string,
    { id: string; regionText: string | null; categoryText: string | null; platformApprovalStatus: string | null }
  >();
  for (const raw of Array.isArray(payload.meetings) ? payload.meetings : []) {
    const row = raw as Record<string, unknown>;
    const roomId = trimText(row.community_messenger_room_id);
    const meetingId = trimText(row.id);
    if (!roomId || !meetingId) continue;
    meetingMetaByRoomId.set(roomId, {
      id: meetingId,
      regionText: trimText(row.region_text) || null,
      categoryText: trimText(row.category_text) || null,
      platformApprovalStatus: trimText(row.platform_approval_status) || null,
    });
  }

  const discoverableGroups = discSummaries
    .map((summary) => {
      if (summary.roomType !== "open_group") return null;
      const meetingMeta = meetingMetaByRoomId.get(summary.id);
      if (meetingMeta?.platformApprovalStatus === "pending_approval") return null;
      return {
        id: summary.id,
        roomType: "open_group" as const,
        roomStatus: summary.roomStatus,
        visibility: "public" as const,
        joinPolicy: summary.joinPolicy === "free" ? "free" : "password",
        identityPolicy: summary.identityPolicy,
        title: summary.title,
        summary: summary.summary,
        ownerUserId: summary.ownerUserId,
        ownerLabel: summary.ownerLabel,
        memberCount: summary.memberCount,
        memberLimit: summary.memberLimit,
        isDiscoverable: summary.isDiscoverable,
        requiresPassword: summary.requiresPassword,
        lastMessage: summary.lastMessage,
        lastMessageAt: summary.lastMessageAt,
        isJoined: joinedRoomIds.has(summary.id),
        meetingId: meetingMeta?.id ?? null,
        regionText: meetingMeta?.regionText ?? null,
        categoryText: meetingMeta?.categoryText ?? null,
        platformApprovalStatus: meetingMeta?.platformApprovalStatus ?? null,
      };
    })
    .filter(Boolean) as CommunityMessengerDiscoverableGroupSummary[];

  const roomSummaryMap = new Map<string, CommunityMessengerRoomSummary>();
  for (const s of mySummaries) roomSummaryMap.set(s.id, s);

  const calls = buildBootstrapCallsFromPreloadedSnapshot(
    userId,
    callRows as never,
    Array.isArray(payload.call_session_participants) ? payload.call_session_participants : [],
    profileById,
    roomSummaryMap
  );

  const me = profileById.get(userId) ?? null;
  const friends = friendIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile))
    .map((profile) => ({
      ...profile,
      friendshipAcceptedAt: friendshipAcceptedAtByPeer.get(profile.id) ?? null,
    }));
  const hiddenIdSet = new Set(
    hiddenIds
      .map((id) => profileById.get(id))
      .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile))
      .map((profile) => profile.id)
  );

  return {
    me,
    tabs: {
      friends: friends.filter((profile) => !hiddenIdSet.has(profile.id)).length,
      chats: chats.length,
      groups: groups.length,
      calls: calls.length,
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
      requestRows as never,
      profileMap
    ),
    chats,
    groups,
    discoverableGroups,
    calls,
  };
}

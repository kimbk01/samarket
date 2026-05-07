import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enrichMessengerTradeUnreadWithLegacyTrade } from "@/lib/community-messenger/enrich-messenger-trade-unread-with-legacy-trade";
import {
  buildParticipantsByRoomMap,
  createEmptyBootstrapRoomsDiagnostics,
  fetchMyRoomsPayload,
  hydrateProfilesLabelsOnlyWithMap,
  participantRowUserId,
  profileLabel,
  sliceGroupParticipantsForRoomBootstrap,
  summarizeRoomsBatchWithProfileMap,
} from "@/lib/community-messenger/service";
import type {
  CommunityMessengerBootstrapCritical,
  CommunityMessengerCriticalParticipantLabel,
  CommunityMessengerCriticalRoomRow,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
  CommunityMessengerRoomType,
} from "@/lib/community-messenger/types";
import { isCommunityMessengerGroupRoomType } from "@/lib/community-messenger/types";

function getSupabaseOrNull(): ReturnType<typeof getSupabaseServer> | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

/** critical tier 방 개수 상한 (full bootstrap 500 과 분리) */
export const COMMUNITY_MESSENGER_BOOTSTRAP_CRITICAL_ROOM_CAP = 30;
const CRITICAL_PARTICIPANT_LABEL_SLICE = 8;

/** 관측 전용 — 라우트 `[cm-bootstrap-v2]` 로 전달 */
export type CommunityMessengerCriticalTierDiagnostics = {
  roomsQueryMs: number;
  participantsQueryMs: number;
  roomsPayloadDbRoundTrips: number;
  profilesMs: number;
  unreadMs: number;
  /** `fetchMyRoomsPayload` queryCount + `profiles` 배치(≤1) + 레거시 거래 미읽음 병합 쿼리 */
  dbRoundTrips: number;
};

function dedupeStringIds(values: Iterable<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function roomRowType(room: { room_type?: unknown; roomType?: unknown }): CommunityMessengerRoomType {
  const t = ("room_type" in room ? room.room_type : room.roomType) as string | undefined;
  return (t === "direct" || t === "private_group" || t === "open_group" ? t : "direct") as CommunityMessengerRoomType;
}

function stripMeForCritical(me: CommunityMessengerProfileLite | undefined): CommunityMessengerProfileLite | null {
  if (!me) return null;
  return {
    ...me,
    friendshipAcceptedAt: undefined,
  };
}

function participantLabelsForRoom(
  participantsForRoom: Array<{ user_id?: string; userId?: string }>,
  profileById: Map<string, CommunityMessengerProfileLite>
): CommunityMessengerCriticalParticipantLabel[] {
  const out: CommunityMessengerCriticalParticipantLabel[] = [];
  const seen = new Set<string>();
  for (const p of participantsForRoom) {
    const uid = participantRowUserId(p as Parameters<typeof participantRowUserId>[0]);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const prof = profileById.get(uid);
    out.push({
      user_id: uid,
      label: prof?.label ?? profileLabel(null, uid),
      avatar_url: prof?.avatarUrl ?? null,
    });
  }
  return out;
}

function summaryToCriticalRow(
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

/** 리스트 첫 화면용 최소 부트스트랩 — trade enrich·친구 그래프·탐색·통화 로그 제외, unread 레거시 병합은 유지 */
export async function loadCommunityMessengerBootstrapCritical(
  userId: string,
  options?: { diagnostics?: CommunityMessengerCriticalTierDiagnostics }
): Promise<CommunityMessengerBootstrapCritical> {
  const diagnostics = options?.diagnostics;
  const roomsDiag = createEmptyBootstrapRoomsDiagnostics();

  const tRooms = performance.now();
  const myPayload = await fetchMyRoomsPayload(userId, {
    diagnostics: roomsDiag,
    includeRoomProfiles: true,
    roomLimit: COMMUNITY_MESSENGER_BOOTSTRAP_CRITICAL_ROOM_CAP,
  });
  const roomsQueryMs = Math.round(performance.now() - tRooms);
  if (diagnostics) {
    diagnostics.roomsQueryMs = roomsQueryMs;
    diagnostics.participantsQueryMs = roomsDiag.round2ParticipantsMs;
    diagnostics.roomsPayloadDbRoundTrips = roomsDiag.queryCount;
  }

  const byRoomId = buildParticipantsByRoomMap(myPayload.participantRows);
  const hydrateIds = new Set<string>([userId]);
  for (const room of myPayload.roomRows) {
    const parts = byRoomId.get(room.id) ?? [];
    const rt = roomRowType(room);
    const sliceRows =
      rt === "direct"
        ? parts
        : sliceGroupParticipantsForRoomBootstrap(parts, userId, CRITICAL_PARTICIPANT_LABEL_SLICE).rows;
    for (const p of sliceRows) {
      const uid = participantRowUserId(p);
      if (uid) hydrateIds.add(uid);
    }
  }

  const sbProfile = getSupabaseOrNull();
  const uniqueProfileTargets = dedupeStringIds(Array.from(hydrateIds));
  const profileDbRoundTrips = uniqueProfileTargets.length > 0 && sbProfile ? 1 : 0;

  const tProf = performance.now();
  const { members } = await hydrateProfilesLabelsOnlyWithMap(userId, Array.from(hydrateIds), { includeSelf: true });
  const profileById = new Map(members.map((m) => [m.id, m]));

  const mySummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    myPayload.roomRows,
    myPayload.roomProfileMap,
    byRoomId,
    profileById
  );

  const profilesMs = Math.round(performance.now() - tProf);
  if (diagnostics) {
    diagnostics.profilesMs = profilesMs;
  }

  const sbBoot = getSupabaseOrNull();

  const enrichUnreadMetrics = { dbRoundTrips: 0 };
  const tUnread = performance.now();
  if (sbBoot) {
    await enrichMessengerTradeUnreadWithLegacyTrade(
      sbBoot as never,
      userId,
      mySummaries,
      enrichUnreadMetrics
    ).catch(() => {});
  }
  const unreadMs = Math.round(performance.now() - tUnread);
  if (diagnostics) {
    diagnostics.unreadMs = unreadMs;
    diagnostics.dbRoundTrips =
      roomsDiag.queryCount + profileDbRoundTrips + enrichUnreadMetrics.dbRoundTrips;
  }

  const chats = mySummaries.filter((room) => room.roomType === "direct");
  const groups = mySummaries.filter((room) => isCommunityMessengerGroupRoomType(room.roomType));

  const mapRows = (summaries: CommunityMessengerRoomSummary[]): CommunityMessengerCriticalRoomRow[] =>
    summaries.map((summary) => {
      const parts = byRoomId.get(summary.id) ?? [];
      const rt = summary.roomType;
      const sliceParticipants =
        rt === "direct"
          ? parts
          : sliceGroupParticipantsForRoomBootstrap(parts, userId, CRITICAL_PARTICIPANT_LABEL_SLICE).rows;
      const labels = participantLabelsForRoom(sliceParticipants, profileById);
      return summaryToCriticalRow(summary, labels);
    });

  const me = stripMeForCritical(profileById.get(userId));

  return {
    tier: "critical",
    me,
    chats: mapRows(chats),
    groups: mapRows(groups),
    tabs: { chats: chats.length, groups: groups.length },
  };
}

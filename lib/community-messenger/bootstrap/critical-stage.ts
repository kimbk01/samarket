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
import { isCommunityMessengerPrivateGroupListRoomType } from "@/lib/community-messenger/types";

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
  /** `summarizeRoomsBatchWithProfileMap` + `mapRows` CPU (critical 전용) */
  criticalCpuMergeMs: number;
  /** `fetchMyRoomsPayload` 의 `community_messenger_room_profiles` 라운드 생략 시 true */
  criticalSkippedRoomProfiles: boolean;
  /** `fetchMyRoomsPayload` 가 반환한 `byRoomId` 재사용으로 `buildParticipantsByRoomMap` 생략 */
  criticalReusedPayloadByRoomId: boolean;
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

type ParticipantIdRow = Parameters<typeof participantRowUserId>[0];

function participantLabelsForRoom(
  participantsForRoom: ParticipantIdRow[],
  profileById: Map<string, CommunityMessengerProfileLite>
): CommunityMessengerCriticalParticipantLabel[] {
  const out: CommunityMessengerCriticalParticipantLabel[] = [];
  const seen = new Set<string>();
  for (const p of participantsForRoom) {
    const uid = participantRowUserId(p);
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
    /** critical JSON 은 `summaryToCriticalRow` 가 peer 라벨·방 메타만 쓰고 room-scoped alias 행은 생략 가능(글로벌 라벨 hydrate 로 동일 표면) */
    includeRoomProfiles: false,
    roomLimit: COMMUNITY_MESSENGER_BOOTSTRAP_CRITICAL_ROOM_CAP,
  });
  const roomsQueryMs = Math.round(performance.now() - tRooms);
  if (diagnostics) {
    diagnostics.roomsQueryMs = roomsQueryMs;
    diagnostics.participantsQueryMs = roomsDiag.round2ParticipantsMs;
    diagnostics.roomsPayloadDbRoundTrips = roomsDiag.queryCount;
    diagnostics.criticalSkippedRoomProfiles = true;
  }

  const byRoomId = myPayload.byRoomId ?? buildParticipantsByRoomMap(myPayload.participantRows);
  if (diagnostics) {
    diagnostics.criticalReusedPayloadByRoomId = myPayload.byRoomId != null;
  }

  const participantSliceByRoom = new Map<string, ParticipantIdRow[]>();
  for (const room of myPayload.roomRows) {
    const parts = byRoomId.get(room.id) ?? [];
    const rt = roomRowType(room);
    const sliceRows =
      rt === "direct"
        ? parts
        : sliceGroupParticipantsForRoomBootstrap(parts, userId, CRITICAL_PARTICIPANT_LABEL_SLICE).rows;
    participantSliceByRoom.set(room.id, sliceRows);
  }

  const hydrateIds = new Set<string>([userId]);
  for (const room of myPayload.roomRows) {
    const sliceRows = participantSliceByRoom.get(room.id) ?? [];
    for (const p of sliceRows) {
      const uid = participantRowUserId(p);
      if (uid) hydrateIds.add(uid);
    }
  }

  const sbProfile = getSupabaseOrNull();
  const uniqueProfileTargets = dedupeStringIds(Array.from(hydrateIds));
  const profileDbRoundTrips = uniqueProfileTargets.length > 0 && sbProfile ? 1 : 0;

  const tHydrate0 = performance.now();
  const { members } = await hydrateProfilesLabelsOnlyWithMap(userId, Array.from(hydrateIds), { includeSelf: true });
  const profileById = new Map(members.map((m) => [m.id, m]));
  if (diagnostics) {
    diagnostics.profilesMs = Math.round(performance.now() - tHydrate0);
  }

  const tSummarize0 = performance.now();
  const mySummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    myPayload.roomRows,
    myPayload.roomProfileMap,
    byRoomId,
    profileById
  );
  const tAfterSummarize = performance.now();

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

  const tMapCpu0 = performance.now();
  const chats = mySummaries.filter((room) => room.roomType === "direct");
  const groups = mySummaries.filter((room) => isCommunityMessengerPrivateGroupListRoomType(room.roomType));

  const mapRows = (summaries: CommunityMessengerRoomSummary[]): CommunityMessengerCriticalRoomRow[] =>
    summaries.map((summary) => {
      const sliceParticipants = participantSliceByRoom.get(summary.id) ?? [];
      const labels = participantLabelsForRoom(sliceParticipants, profileById);
      return summaryToCriticalRow(summary, labels);
    });

  const me = stripMeForCritical(profileById.get(userId));
  const chatsRows = mapRows(chats);
  const groupsRows = mapRows(groups);
  if (diagnostics) {
    const summarizeCpuMs = Math.round(tAfterSummarize - tSummarize0);
    const mapCpuMs = Math.round(performance.now() - tMapCpu0);
    diagnostics.criticalCpuMergeMs = summarizeCpuMs + mapCpuMs;
  }

  return {
    tier: "critical",
    me,
    chats: chatsRows,
    groups: groupsRows,
    tabs: { chats: chats.length, groups: groups.length },
  };
}

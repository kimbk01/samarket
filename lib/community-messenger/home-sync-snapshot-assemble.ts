/**
 * Home-sync critical snapshot assembly — CPU-only from precomputed RPC payload.
 * No DB round trips after counter row / unified RPC read.
 */
import {
  buildParticipantsByRoomMap,
  hydrateProfilesLabelsOnlyWithMap,
  summarizeRoomsBatchWithProfileMap,
} from "@/lib/community-messenger/service";
import {
  enrichMessengerTradeUnreadWithLegacyTrade,
  type Hs5LegacyLoadResult,
} from "@/lib/community-messenger/enrich-messenger-trade-unread-with-legacy-trade";
import { COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP } from "@/lib/community-messenger/home-sync-room-caps";
import type { HomeSyncTrace } from "@/lib/community-messenger/home-sync-trace";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { isCommunityMessengerPrivateGroupListRoomType } from "@/lib/community-messenger/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HomeSyncSnapshotPayloadJson = {
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
  room_cap?: number;
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

function parseLiteBundle(payload: HomeSyncSnapshotPayloadJson) {
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

  const profileLabels = parseProfileLabels(raw.profile_labels);
  const byRoomId = buildParticipantsByRoomMap(participantRows);
  return { roomRows, participantRows, byRoomId, profileLabels };
}

function hs5FromSnapshot(payload: HomeSyncSnapshotPayloadJson): Hs5LegacyLoadResult {
  const hs5 = payload.hs5 ?? {};
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

export type AssembleHomeSyncCriticalResult = {
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
  payloadBuildMs: number;
  summarizeMs: number;
  unreadBadgeMs: number;
  participantsProfilesMs: number;
};

/** Assemble critical tier lists from snapshot JSON — zero DB RTT. */
export async function assembleHomeSyncCriticalFromSnapshotPayload(
  userId: string,
  payload: HomeSyncSnapshotPayloadJson,
  sbAny: SupabaseClient<any> | null,
  trace?: HomeSyncTrace
): Promise<AssembleHomeSyncCriticalResult | null> {
  const t0 = performance.now();
  const parsed = parseLiteBundle(payload);
  if (!parsed) return null;

  const cap = COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP;
  const roomRows =
    parsed.roomRows.length > cap ? parsed.roomRows.slice(0, cap) : parsed.roomRows;
  const allow = new Set(roomRows.map((r) => r.id));
  const participantRows = parsed.participantRows.filter((p) => allow.has(p.room_id));
  const byRoomId = buildParticipantsByRoomMap(participantRows);

  const allIds = dedupeIds([userId, ...participantRows.map((p) => p.user_id)]);
  const tHydrate = performance.now();
  const { members } = await hydrateProfilesLabelsOnlyWithMap(userId, allIds, {
    includeSelf: true,
    prefetchedProfiles: parsed.profileLabels,
    bootstrapLiteFirstPaint: true,
    trace,
  });
  const participantsProfilesMs = performance.now() - tHydrate;
  const profileById = new Map(members.map((m) => [m.id, m]));

  const tSummarize = performance.now();
  const mySummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    roomRows,
    new Map(),
    byRoomId,
    profileById
  );
  const summarizeMs = performance.now() - tSummarize;

  let unreadBadgeMs = 0;
  if (sbAny) {
    const tUnread = performance.now();
    const preloaded = hs5FromSnapshot(payload);
    await enrichMessengerTradeUnreadWithLegacyTrade(
      sbAny,
      userId,
      mySummaries,
      undefined,
      trace,
      { preloadedLegacy: preloaded }
    ).catch(() => {});
    unreadBadgeMs = performance.now() - tUnread;
  }

  const chats = mySummaries.filter((room) => room.roomType === "direct");
  const groups = mySummaries.filter((room) => isCommunityMessengerPrivateGroupListRoomType(room.roomType));
  const payloadBuildMs = performance.now() - t0;

  return {
    chats,
    groups,
    payloadBuildMs,
    summarizeMs,
    unreadBadgeMs,
    participantsProfilesMs,
  };
}

export function parseHomeSyncSnapshotRpcData(data: unknown): HomeSyncSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as HomeSyncSnapshotPayloadJson;
}

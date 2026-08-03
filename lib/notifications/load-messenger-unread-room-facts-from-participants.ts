/**
 * Canonical messenger unread-room Facts for Bottom Chat / App Icon messenger axis.
 *
 * CONTRACT (Badge Authority Rebuild 2026-07-31 Phase A evidence):
 * - List row badge reads `community_messenger_participants.unread_count`.
 * - Bottom / App Icon messenger MUST use the same active-room set — not a divergent
 *   `notification_targets.chat_room` snapshot (measured Xiaomi: 4 GD rows vs Bottom 2).
 * - Active = unread_count > 0 AND left_at IS NULL AND room.deleted_at IS NULL
 *   AND chat_domain ∈ {general_direct, group}.
 *
 * Trade / store_order stay on
 * `loadTradeStoreOrderUnreadRoomFactsFromParticipants` (same participant unread SSOT).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isRoomUuidFallbackIdentityKey } from "@/lib/notifications/badge-authority-rebuild/canonical-conversation-room-identity";

export type MessengerUnreadRoomFactsFromParticipants = Readonly<{
  generalDirectUnreadRoomIds: readonly string[];
  groupUnreadRoomIds: readonly string[];
  domainUnreadRooms: {
    general_direct: number;
    group: number;
  };
  rowUnreadByRoomId: Readonly<Record<string, number>>;
  /** Gate 3 Step 12 — proven domain keys only (no invent). */
  domainIdentityKeyByRoomId: Readonly<Record<string, string>>;
  /** Peer for general_direct ADAPTER when key missing. */
  peerUserIdByRoomId: Readonly<Record<string, string>>;
}>;

const EMPTY: MessengerUnreadRoomFactsFromParticipants = {
  generalDirectUnreadRoomIds: [],
  groupUnreadRoomIds: [],
  domainUnreadRooms: { general_direct: 0, group: 0 },
  rowUnreadByRoomId: {},
  domainIdentityKeyByRoomId: {},
  peerUserIdByRoomId: {},
};

type PartRow = {
  room_id?: unknown;
  unread_count?: unknown;
  left_at?: unknown;
};

type RoomRow = {
  id?: unknown;
  chat_domain?: unknown;
  deleted_at?: unknown;
  /** Empty last_message + unread_count>0 = phantom/stale counter (Xiaomi zxzx44). */
  last_message?: unknown;
  domain_identity_key?: unknown;
};

/**
 * Pure partition — join participants unread with room domain/deleted.
 * Excludes phantom rooms: unread_count>0 but no last_message body (stale counter).
 */
export function partitionMessengerUnreadRoomFactsFromParticipants(
  parts: ReadonlyArray<PartRow>,
  rooms: ReadonlyArray<RoomRow>
): MessengerUnreadRoomFactsFromParticipants {
  const roomById = new Map<string, RoomRow>();
  for (const r of rooms) {
    const id = String(r.id ?? "").trim();
    if (id) roomById.set(id, r);
  }

  const gd = new Set<string>();
  const group = new Set<string>();
  const rowUnread: Record<string, number> = {};
  const domainIdentityKeyByRoomId: Record<string, string> = {};

  for (const p of parts) {
    const roomId = String(p.room_id ?? "").trim();
    if (!roomId) continue;
    if (p.left_at != null && String(p.left_at).trim() !== "") continue;
    const unread = Math.max(0, Math.floor(Number(p.unread_count) || 0));
    if (unread <= 0) continue;
    const room = roomById.get(roomId);
    if (!room) continue;
    if (room.deleted_at != null && String(room.deleted_at).trim() !== "") continue;
    const lastMessage = room.last_message;
    if (lastMessage !== undefined && !String(lastMessage ?? "").trim()) continue;
    const domain = String(room.chat_domain ?? "").trim();
    const rawIdentity = String(room.domain_identity_key ?? "").trim();
    const identity =
      rawIdentity && !isRoomUuidFallbackIdentityKey(rawIdentity) ? rawIdentity : "";
    if (domain === "general_direct") {
      gd.add(roomId);
      rowUnread[roomId] = unread;
      if (identity) domainIdentityKeyByRoomId[roomId] = identity;
    } else if (domain === "group") {
      group.add(roomId);
      rowUnread[roomId] = unread;
      if (identity) domainIdentityKeyByRoomId[roomId] = identity;
      else domainIdentityKeyByRoomId[roomId] = `group:${roomId}`;
    }
  }

  return {
    generalDirectUnreadRoomIds: [...gd].sort(),
    groupUnreadRoomIds: [...group].sort(),
    domainUnreadRooms: {
      general_direct: gd.size,
      group: group.size,
    },
    rowUnreadByRoomId: rowUnread,
    domainIdentityKeyByRoomId,
    peerUserIdByRoomId: {},
  };
}

export async function loadMessengerUnreadRoomFactsFromParticipants(
  sb: SupabaseClient,
  userId: string
): Promise<MessengerUnreadRoomFactsFromParticipants> {
  const uid = userId.trim();
  if (!uid) return EMPTY;

  const { data: parts, error: partErr } = await sb
    .from("community_messenger_participants")
    .select("room_id, unread_count, left_at")
    .eq("user_id", uid)
    .gt("unread_count", 0)
    .is("left_at", null);

  if (partErr) {
    console.warn("[loadMessengerUnreadRoomFactsFromParticipants]", partErr.message);
    return EMPTY;
  }

  const roomIds = [
    ...new Set(
      (parts ?? [])
        .map((p) => String((p as PartRow).room_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (roomIds.length === 0) return EMPTY;

  const { data: rooms, error: roomErr } = await sb
    .from("community_messenger_rooms")
    .select("id, chat_domain, deleted_at, last_message, domain_identity_key")
    .in("id", roomIds);

  if (roomErr) {
    console.warn("[loadMessengerUnreadRoomFactsFromParticipants] rooms", roomErr.message);
    return EMPTY;
  }

  const base = partitionMessengerUnreadRoomFactsFromParticipants(
    (parts ?? []) as PartRow[],
    (rooms ?? []) as RoomRow[]
  );

  // ADAPTER: peer for GD rooms missing domain_identity_key (never invent :room:uuid).
  const needPeer = base.generalDirectUnreadRoomIds.filter(
    (id) => !base.domainIdentityKeyByRoomId[id]
  );
  if (needPeer.length === 0) return base;

  const { data: peerParts, error: peerErr } = await sb
    .from("community_messenger_participants")
    .select("room_id, user_id")
    .in("room_id", needPeer)
    .neq("user_id", uid)
    .is("left_at", null);

  if (peerErr) {
    console.warn("[loadMessengerUnreadRoomFactsFromParticipants] peers", peerErr.message);
    return base;
  }

  const peerUserIdByRoomId: Record<string, string> = {};
  for (const row of peerParts ?? []) {
    const roomId = String((row as { room_id?: unknown }).room_id ?? "").trim();
    const peer = String((row as { user_id?: unknown }).user_id ?? "").trim();
    if (!roomId || !peer || peerUserIdByRoomId[roomId]) continue;
    peerUserIdByRoomId[roomId] = peer;
  }

  return { ...base, peerUserIdByRoomId };
}

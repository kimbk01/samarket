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
 * Trade / store_order stay on notification_targets loaders.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type MessengerUnreadRoomFactsFromParticipants = Readonly<{
  generalDirectUnreadRoomIds: readonly string[];
  groupUnreadRoomIds: readonly string[];
  domainUnreadRooms: {
    general_direct: number;
    group: number;
  };
  rowUnreadByRoomId: Readonly<Record<string, number>>;
}>;

const EMPTY: MessengerUnreadRoomFactsFromParticipants = {
  generalDirectUnreadRoomIds: [],
  groupUnreadRoomIds: [],
  domainUnreadRooms: { general_direct: 0, group: 0 },
  rowUnreadByRoomId: {},
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
};

/**
 * Pure partition — join participants unread with room domain/deleted.
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

  for (const p of parts) {
    const roomId = String(p.room_id ?? "").trim();
    if (!roomId) continue;
    if (p.left_at != null && String(p.left_at).trim() !== "") continue;
    const unread = Math.max(0, Math.floor(Number(p.unread_count) || 0));
    if (unread <= 0) continue;
    const room = roomById.get(roomId);
    if (!room) continue;
    if (room.deleted_at != null && String(room.deleted_at).trim() !== "") continue;
    const domain = String(room.chat_domain ?? "").trim();
    if (domain === "general_direct") {
      gd.add(roomId);
      rowUnread[roomId] = unread;
    } else if (domain === "group") {
      group.add(roomId);
      rowUnread[roomId] = unread;
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
    .select("id, chat_domain, deleted_at")
    .in("id", roomIds);

  if (roomErr) {
    console.warn("[loadMessengerUnreadRoomFactsFromParticipants] rooms", roomErr.message);
    return EMPTY;
  }

  return partitionMessengerUnreadRoomFactsFromParticipants(
    (parts ?? []) as PartRow[],
    (rooms ?? []) as RoomRow[]
  );
}

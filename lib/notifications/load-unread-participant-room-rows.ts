/**
 * S2 (2026-11-09) — 배지 권위 1회 계산 안에서 participants·rooms 를 한 번만 읽는다.
 *
 * 이전: `loadMessengerUnreadRoomFactsFromParticipants` 와 `loadTradeStoreOrderUnreadRoomFactsFromParticipants` 가
 * 같은 조건(user_id = 나, unread_count > 0, left_at IS NULL)의 participants 조회와 같은 방 id 의 rooms 조회를
 * 각각 실행했다 — 읽음 ACK·badge-count 마다 같은 DB 조회 2건이 중복.
 * 같은 행을 한 번 읽어 두 로더가 나눠 쓴다. 거래·주문 로더의 `chat_domain` 필터는 메모리에서 같은 조건으로 적용한다.
 *
 * @see docs/audit/store-order-chat-open-read-request-surge-design-2026-11-09.md §3 S2
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type UnreadParticipantRow = {
  room_id?: unknown;
  unread_count?: unknown;
  left_at?: unknown;
};

export type UnreadParticipantRoomRow = {
  id?: unknown;
  chat_domain?: unknown;
  deleted_at?: unknown;
  last_message?: unknown;
  domain_identity_key?: unknown;
};

export type UnreadParticipantRoomRows =
  | { ok: true; parts: UnreadParticipantRow[]; rooms: UnreadParticipantRoomRow[] }
  | { ok: false; stage: "participants" | "rooms"; message: string };

export async function loadUnreadParticipantRoomRows(
  sb: SupabaseClient,
  userId: string
): Promise<UnreadParticipantRoomRows> {
  const uid = userId.trim();
  if (!uid) return { ok: true, parts: [], rooms: [] };

  const { data: parts, error: partErr } = await sb
    .from("community_messenger_participants")
    .select("room_id, unread_count, left_at")
    .eq("user_id", uid)
    .gt("unread_count", 0)
    .is("left_at", null);
  if (partErr) return { ok: false, stage: "participants", message: partErr.message };

  const partRows = (parts ?? []) as UnreadParticipantRow[];
  const roomIds = [
    ...new Set(partRows.map((p) => String(p.room_id ?? "").trim()).filter(Boolean)),
  ];
  if (roomIds.length === 0) return { ok: true, parts: partRows, rooms: [] };

  const { data: rooms, error: roomErr } = await sb
    .from("community_messenger_rooms")
    .select("id, chat_domain, deleted_at, last_message, domain_identity_key")
    .in("id", roomIds);
  if (roomErr) return { ok: false, stage: "rooms", message: roomErr.message };

  return { ok: true, parts: partRows, rooms: (rooms ?? []) as UnreadParticipantRoomRow[] };
}

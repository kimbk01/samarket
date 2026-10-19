/**
 * 채팅 Admin R1 (B · C-1) — 거래 Admin 목록 행에 사용자 방(CM) id·상태를 붙인다. 조회 전용.
 * 서버 전용 (service role sb 주입). 클라이언트는 타입만 import.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds } from "@/lib/chats/chat-list-limits";
import {
  emptyTradeLegacyRoomRefs,
  resolveTradeMessengerRoomIdsBatch,
  type TradeLegacyRoomRefs,
} from "@/lib/admin-chats/trade-messenger-room";

export type AdminTradeListMessenger = {
  roomId: string;
  roomStatus: "active" | "blocked" | "archived";
  isReadonly: boolean;
};

export async function attachTradeMessengerRoomsToLegacyList(
  sb: SupabaseClient<any>,
  rows: ReadonlyArray<{ key: string } & Partial<TradeLegacyRoomRefs>>
): Promise<Map<string, AdminTradeListMessenger>> {
  const out = new Map<string, AdminTradeListMessenger>();
  if (!rows.length) return out;
  const roomIdByKey = await resolveTradeMessengerRoomIdsBatch(
    sb,
    rows.map((r) => ({ key: r.key, refs: emptyTradeLegacyRoomRefs(r) }))
  );
  const roomIds = [...new Set(roomIdByKey.values())];
  const statusById = new Map<string, { room_status?: unknown; is_readonly?: unknown }>();
  for (const chunk of chunkIds(roomIds, 80)) {
    const { data } = await sb
      .from("community_messenger_rooms")
      .select("id, room_status, is_readonly")
      .in("id", chunk);
    for (const row of (data ?? []) as Array<{ id: string; room_status?: unknown; is_readonly?: unknown }>) {
      statusById.set(row.id, row);
    }
  }
  for (const [key, roomId] of roomIdByKey) {
    const st = statusById.get(roomId);
    const rs = st?.room_status;
    out.set(key, {
      roomId,
      roomStatus: rs === "blocked" ? "blocked" : rs === "archived" ? "archived" : "active",
      isReadonly: st?.is_readonly === true,
    });
  }
  return out;
}

import type { SupabaseClient } from "@supabase/supabase-js";

function trimMid(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t || undefined;
}

/** `ensureCommunityMessengerDirectRoomFromProductChat` 성공 직후 — 원장에 CM 방 ID 고정 */
export async function persistProductChatMessengerRoomId(
  sb: SupabaseClient<any>,
  productChatId: string,
  messengerRoomId: string
): Promise<void> {
  const pc = productChatId.trim();
  const mid = messengerRoomId.trim();
  if (!pc || !mid) return;
  const { error } = await sb
    .from("product_chats")
    .update({ community_messenger_room_id: mid })
    .eq("id", pc);
  if (error) {
    /* 마이그레이션 미적용·RLS 등 — 상위 로직은 이미 CM 방을 확보한 상태 */
  }
}

/**
 * `chat_rooms` 에만 CM id 가 있고 `product_chats` 는 비어 있을 때 — 목록 enrich Phase B 조인 복구.
 * 이미 다른 방이 박혀 있으면 덮어쓰지 않는다(운영 데이터 보호).
 */
export async function persistProductChatMessengerRoomIdIfNull(
  sb: SupabaseClient<any>,
  productChatId: string,
  messengerRoomId: string
): Promise<void> {
  const pc = productChatId.trim();
  const mid = messengerRoomId.trim();
  if (!pc || !mid) return;
  const { data: row, error: selErr } = await sb
    .from("product_chats")
    .select("community_messenger_room_id")
    .eq("id", pc)
    .maybeSingle();
  if (selErr) return;
  const cur = trimMid((row as { community_messenger_room_id?: unknown } | null)?.community_messenger_room_id);
  if (cur) return;
  await persistProductChatMessengerRoomId(sb, pc, mid);
}

/** item_trade `chat_rooms` 행과 메신저 방 ID 동기 (당근형 chat_rooms.id 로 들어오는 경로) */
export async function syncChatRoomMessengerLink(
  sb: SupabaseClient<any>,
  chatRoomId: string,
  messengerRoomId: string
): Promise<void> {
  const cid = chatRoomId.trim();
  const mid = messengerRoomId.trim();
  if (!cid || !mid) return;
  const { error } = await sb
    .from("chat_rooms")
    .update({ community_messenger_room_id: mid })
    .eq("id", cid)
    .eq("room_type", "item_trade");
  if (error) {
    /* ignore */
  }
}

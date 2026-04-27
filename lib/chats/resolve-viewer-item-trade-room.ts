import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatRoomSource } from "@/lib/types/chat";

export type ViewerItemTradeRoomResult = {
  roomId: string | null;
  source: ChatRoomSource | null;
  /** 행의 `community_messenger_room_id` — API 응답 `messengerRoomId` 와 동일 */
  messengerRoomId: string | null;
};

/**
 * 구매자·상품 기준 기존 거래 채팅 방 ID (`chat_rooms` item_trade → `product_chats`).
 * GET `/api/chat/item/room-id` 와 동일 로직 — RSC에서 선조회해 클라 왕복 1회 제거.
 * `roomId` 는 부트스트랩용 행 id(`chat_rooms` / `product_chats`), 메신저 URL 은 `messengerRoomId` 우선.
 *
 * **당근형 거래방 경계**: 친구 DM·커뮤니티 메신저와 별개(메신저 `direct_key` 가 쌍-only 가 아님).
 * 동일 판매자·구매자라도 `item_id`(상품)가 다르면 다른 `item_trade` 행.
 * 동일 상품·동일 쌍은 **최근 `updated_at` 방** 하나를 반환하고 재사용한다.
 */
export async function resolveViewerItemTradeRoom(
  sb: SupabaseClient,
  args: { itemId: string; viewerUserId: string; sellerId: string }
): Promise<ViewerItemTradeRoomResult> {
  const itemId = args.itemId?.trim() ?? "";
  const viewerUserId = args.viewerUserId?.trim() ?? "";
  const sellerId = args.sellerId?.trim() ?? "";
  if (!itemId || !viewerUserId || !sellerId) {
    return { roomId: null, source: null, messengerRoomId: null };
  }
  if (viewerUserId === sellerId) {
    return { roomId: null, source: null, messengerRoomId: null };
  }

  const sbAny = sb;

  const { data: crRows } = await sbAny
    .from("chat_rooms")
    .select("id, community_messenger_room_id")
    .eq("room_type", "item_trade")
    .eq("item_id", itemId)
    .eq("buyer_id", viewerUserId)
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(1);
  const crRow = crRows?.[0] as { id?: string; community_messenger_room_id?: string | null } | undefined;
  const crId = crRow?.id;
  const crMid =
    typeof crRow?.community_messenger_room_id === "string" && crRow.community_messenger_room_id.trim()
      ? crRow.community_messenger_room_id.trim()
      : null;
  if (crId) {
    return {
      /** `chat_rooms.id` — 거래 부트스트랩·프리웜은 이 값으로만 호출 */
      roomId: crId,
      source: "chat_room",
      messengerRoomId: crMid,
    };
  }

  const { data: pcRows } = await sbAny
    .from("product_chats")
    .select("id, community_messenger_room_id")
    .eq("post_id", itemId)
    .eq("buyer_id", viewerUserId)
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(1);
  const pcRow = pcRows?.[0] as { id?: string; community_messenger_room_id?: string | null } | undefined;
  const pcMid =
    typeof pcRow?.community_messenger_room_id === "string" && pcRow.community_messenger_room_id.trim()
      ? pcRow.community_messenger_room_id.trim()
      : null;
  const pcId = pcRow?.id;

  return {
    /** `product_chats.id` — 레거시 메시지 부트스트랩용 */
    roomId: pcId ?? null,
    source: pcId ? "product_chat" : null,
    messengerRoomId: pcMid,
  };
}

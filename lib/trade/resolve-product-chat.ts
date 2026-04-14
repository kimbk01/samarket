import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProductChatRowForItemTrade } from "./ensure-product-chat-for-item-trade";
import { PRODUCT_CHAT_ROW_SELECT } from "@/lib/trade/product-chat-select";

export type ProductChatRow = Record<string, unknown> & {
  id: string;
  post_id: string;
  seller_id: string;
  buyer_id: string;
  community_messenger_room_id?: string | null;
  trade_flow_status?: string | null;
};

function trimMessengerId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t || null;
}

export type ResolveProductChatResult = {
  productChat: ProductChatRow;
  productChatId: string;
  /** 원장에 박힌 메신저 방 ID — 있으면 브리지 없이 바로 CM 부트스트랩 */
  messengerRoomId: string | null;
};

/**
 * URL의 roomId가 product_chats.id 이거나 chat_rooms(item_trade).id 일 때 product_chats 행을 찾는다.
 */
export async function resolveProductChat(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<ResolveProductChatResult | null> {
  const { data: pc } = await sb
    .from("product_chats")
    .select(PRODUCT_CHAT_ROW_SELECT)
    .eq("id", roomId)
    .maybeSingle();

  if (pc && (pc as ProductChatRow).id) {
    const row = pc as ProductChatRow;
    return {
      productChat: row,
      productChatId: row.id,
      messengerRoomId: trimMessengerId(row.community_messenger_room_id),
    };
  }

  const { data: cr } = await sb
    .from("chat_rooms")
    .select("id, item_id, seller_id, buyer_id, room_type, community_messenger_room_id")
    .eq("id", roomId)
    .eq("room_type", "item_trade")
    .maybeSingle();

  if (!cr || !(cr as { item_id?: string }).item_id) return null;

  const itemId = (cr as { item_id: string }).item_id;
  const sellerId = (cr as { seller_id: string | null }).seller_id;
  const buyerId = (cr as { buyer_id: string | null }).buyer_id;
  if (!sellerId || !buyerId) return null;

  const crMid = trimMessengerId((cr as { community_messenger_room_id?: unknown }).community_messenger_room_id);

  const ensured = await ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId);
  if (!ensured?.id) return null;
  const ensuredMid = trimMessengerId((ensured as ProductChatRow).community_messenger_room_id);
  return {
    productChat: ensured as ProductChatRow,
    productChatId: ensured.id,
    messengerRoomId: crMid ?? ensuredMid,
  };
}

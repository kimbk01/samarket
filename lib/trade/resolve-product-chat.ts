import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProductChatRowForItemTrade } from "./ensure-product-chat-for-item-trade";

export type ProductChatRow = Record<string, unknown> & {
  id: string;
  post_id: string;
  seller_id: string;
  buyer_id: string;
};

/**
 * URL의 roomId가 product_chats.id 이거나 chat_rooms(item_trade).id 일 때 product_chats 행을 찾는다.
 */
export async function resolveProductChat(
  sb: SupabaseClient<any>,
  roomId: string
): Promise<{ productChat: ProductChatRow; productChatId: string } | null> {
  const { data: pc } = await sb
    .from("product_chats")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  if (pc && (pc as ProductChatRow).id) {
    return { productChat: pc as ProductChatRow, productChatId: (pc as ProductChatRow).id };
  }

  const { data: cr } = await sb
    .from("chat_rooms")
    .select("id, item_id, seller_id, buyer_id, room_type")
    .eq("id", roomId)
    .eq("room_type", "item_trade")
    .maybeSingle();

  if (!cr || !(cr as { item_id?: string }).item_id) return null;

  const itemId = (cr as { item_id: string }).item_id;
  const sellerId = (cr as { seller_id: string | null }).seller_id;
  const buyerId = (cr as { buyer_id: string | null }).buyer_id;
  if (!sellerId || !buyerId) return null;

  const ensured = await ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId);
  if (!ensured?.id) return null;
  return { productChat: ensured, productChatId: ensured.id };
}

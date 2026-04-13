import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductChatRow } from "./resolve-product-chat";
import { PRODUCT_CHAT_ROW_SELECT } from "@/lib/trade/product-chat-select";

/**
 * 당근형 item/start(chat_rooms)만 있고 product_chats가 없을 때 거래 API가 깨지지 않도록 행을 맞춘다.
 * UNIQUE(post_id, seller_id, buyer_id) — 동시 생성 시 한 번 더 조회한다.
 */
export async function ensureProductChatRowForItemTrade(
  sb: SupabaseClient<any>,
  itemId: string,
  sellerId: string,
  buyerId: string
): Promise<ProductChatRow | null> {
  const { data: existing } = await sb
    .from("product_chats")
    .select(PRODUCT_CHAT_ROW_SELECT)
    .eq("post_id", itemId)
    .eq("seller_id", sellerId)
    .eq("buyer_id", buyerId)
    .maybeSingle();

  if (existing && (existing as ProductChatRow).id) {
    return existing as ProductChatRow;
  }

  const { data: inserted, error: insErr } = await sb
    .from("product_chats")
    .insert({ post_id: itemId, seller_id: sellerId, buyer_id: buyerId })
    .select(PRODUCT_CHAT_ROW_SELECT)
    .maybeSingle();

  if (inserted && (inserted as ProductChatRow).id) {
    return inserted as ProductChatRow;
  }

  if (insErr) {
    const { data: afterRace } = await sb
      .from("product_chats")
      .select(PRODUCT_CHAT_ROW_SELECT)
      .eq("post_id", itemId)
      .eq("seller_id", sellerId)
      .eq("buyer_id", buyerId)
      .maybeSingle();
    if (afterRace && (afterRace as ProductChatRow).id) {
      return afterRace as ProductChatRow;
    }
  }

  return null;
}

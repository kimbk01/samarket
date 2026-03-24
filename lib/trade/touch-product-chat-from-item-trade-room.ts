import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProductChatRowForItemTrade } from "./ensure-product-chat-for-item-trade";

export type ItemTradeRoomRowForSync = {
  item_id?: string | null;
  seller_id?: string | null;
  buyer_id?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
};

/**
 * 당근형 거래 채팅(chat_rooms) 기준으로 product_chats 행을 맞추고,
 * 판매/구매 내역·정렬용 last_message_* 를 동기화한다.
 */
export async function touchProductChatPreviewFromItemTradeRoom(
  sb: SupabaseClient<any>,
  cr: ItemTradeRoomRowForSync
): Promise<void> {
  const itemId = cr.item_id != null ? String(cr.item_id).trim() : "";
  const sellerId = cr.seller_id != null ? String(cr.seller_id).trim() : "";
  const buyerId = cr.buyer_id != null ? String(cr.buyer_id).trim() : "";
  if (!itemId || !sellerId || !buyerId) return;

  const pc = await ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId);
  if (!pc?.id) return;

  const at = cr.last_message_at != null ? String(cr.last_message_at).trim() : "";
  if (!at) return;

  const preview = (cr.last_message_preview != null ? String(cr.last_message_preview) : "").slice(0, 200);

  await sb
    .from("product_chats")
    .update({
      last_message_at: at,
      last_message_preview: preview,
      updated_at: at,
    })
    .eq("id", pc.id as string);
}

/**
 * 거래 채팅 메시지 1건 전송 후: 미리보기 + 상대방 product_chats 미읽음 (레거시 카운트와 목록 API 정합)
 */
export async function touchProductChatAfterItemTradeMessage(
  sb: SupabaseClient<any>,
  cr: ItemTradeRoomRowForSync,
  messageSenderId: string
): Promise<void> {
  const itemId = cr.item_id != null ? String(cr.item_id).trim() : "";
  const sellerId = cr.seller_id != null ? String(cr.seller_id).trim() : "";
  const buyerId = cr.buyer_id != null ? String(cr.buyer_id).trim() : "";
  if (!itemId || !sellerId || !buyerId) return;

  const pc = await ensureProductChatRowForItemTrade(sb, itemId, sellerId, buyerId);
  if (!pc?.id) return;

  const at = cr.last_message_at != null ? String(cr.last_message_at).trim() : "";
  if (!at) return;

  const preview = (cr.last_message_preview != null ? String(cr.last_message_preview) : "").slice(0, 200);
  const row = pc as Record<string, unknown>;
  const us = Number(row.unread_count_seller) || 0;
  const ub = Number(row.unread_count_buyer) || 0;
  const isSeller = messageSenderId === sellerId;

  await sb
    .from("product_chats")
    .update({
      last_message_at: at,
      last_message_preview: preview,
      updated_at: at,
      unread_count_seller: isSeller ? us : us + 1,
      unread_count_buyer: isSeller ? ub + 1 : ub,
    })
    .eq("id", pc.id as string);
}

/**
 * 내 판매/구매에 해당하는 item_trade 방들에 대해 product_chats 를 일괄 맞춤 (목록 API 진입 시).
 */
export async function reconcileProductChatsFromItemTradeRoomsForUser(
  sb: SupabaseClient<any>,
  userId: string,
  role: "seller" | "buyer"
): Promise<void> {
  let q = sb
    .from("chat_rooms")
    .select("item_id, seller_id, buyer_id, last_message_at, last_message_preview")
    .eq("room_type", "item_trade");
  q = role === "seller" ? q.eq("seller_id", userId) : q.eq("buyer_id", userId);
  const { data: rows, error } = await q;
  if (error || !rows?.length) return;
  for (const cr of rows as ItemTradeRoomRowForSync[]) {
    await touchProductChatPreviewFromItemTradeRoom(sb, cr);
  }
}

/** 내가 작성한 판매 글(post id들)에 달린 item_trade 방 → product_chats 보정 (seller_id 컬럼 오류 대비) */
export async function reconcileProductChatsFromItemTradeByPostIds(
  sb: SupabaseClient<any>,
  postIds: string[]
): Promise<void> {
  const ids = [...new Set(postIds.map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return;
  const { data: rows, error } = await sb
    .from("chat_rooms")
    .select("item_id, seller_id, buyer_id, last_message_at, last_message_preview")
    .eq("room_type", "item_trade")
    .in("item_id", ids);
  if (error || !rows?.length) return;
  for (const cr of rows as ItemTradeRoomRowForSync[]) {
    await touchProductChatPreviewFromItemTradeRoom(sb, cr);
  }
}

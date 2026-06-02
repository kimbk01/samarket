/**
 * 거래 메신저 방 전송 직전 — product_chats / chat_rooms FK 가 CM 방 id 와 어긋나면 1회 정렬.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTradeMessengerDirectKey } from "@/lib/messenger-policy/parse-trade-messenger-direct-key";
import {
  persistProductChatMessengerRoomId,
  syncChatRoomMessengerLink,
} from "@/lib/trade/persist-trade-messenger-room-link";

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** FK·direct_key 기준으로 원장 링크를 CM 방 id 에 맞춘다. 변경이 있으면 true. */
export async function reconcileMessengerTradeRoomLinkOnSend(
  sb: SupabaseClient<any>,
  messengerRoomId: string
): Promise<boolean> {
  const rid = trimId(messengerRoomId);
  if (!rid) return false;

  const { data: roomRow } = await sb
    .from("community_messenger_rooms")
    .select("direct_key")
    .eq("id", rid)
    .maybeSingle();
  const directKey = trimId((roomRow as { direct_key?: unknown } | null)?.direct_key);
  const parsed = parseTradeMessengerDirectKey(directKey);
  if (!parsed) return false;

  let changed = false;
  if (parsed.kind === "trade_pc") {
    await persistProductChatMessengerRoomId(sb, parsed.productChatId, rid);
    changed = true;
  }
  if (parsed.kind === "trade_item") {
    await syncChatRoomMessengerLink(sb, parsed.itemTradeChatRoomId, rid);
    const { data: cr } = await sb
      .from("chat_rooms")
      .select("item_id, seller_id, buyer_id")
      .eq("id", parsed.itemTradeChatRoomId)
      .eq("room_type", "item_trade")
      .maybeSingle();
    if (cr && typeof cr === "object") {
      const itemId = trimId((cr as { item_id?: unknown }).item_id);
      const sellerId = trimId((cr as { seller_id?: unknown }).seller_id);
      const buyerId = trimId((cr as { buyer_id?: unknown }).buyer_id);
      if (itemId && sellerId && buyerId) {
        const { data: pc } = await sb
          .from("product_chats")
          .select("id")
          .eq("post_id", itemId)
          .eq("seller_id", sellerId)
          .eq("buyer_id", buyerId)
          .maybeSingle();
        const pcId = trimId((pc as { id?: unknown } | null)?.id);
        if (pcId) {
          await persistProductChatMessengerRoomId(sb, pcId, rid);
          changed = true;
        }
      }
    }
  }
  return changed;
}

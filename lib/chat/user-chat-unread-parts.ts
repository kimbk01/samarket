/**
 * 사용자 기준 채팅 미읽음 — product_chats 와 chat_rooms(item_trade) 동시 존재 시 이중 집계 방지.
 * - 참가자 unread: room_type 별로 분리 (매장 주문 vs 그 외)
 * - product_chats: 동일 거래에 item_trade 통합방이 있으면 스킵 (참가자 수치만 사용)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type UserChatUnreadParts = {
  /** store_order 방 참가자 unread 합 */
  storeOrderParticipantUnread: number;
  /** store_order 제외 chat_room 참가자 unread 합 (item_trade·일반 등) */
  otherParticipantUnread: number;
  /** 통합방과 묶이지 않은 product_chats unread 합 */
  productChatUnreadDeduped: number;
};

export async function computeUserChatUnreadParts(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<UserChatUnreadParts> {
  const { data: partRows } = await sbAny
    .from("chat_room_participants")
    .select("room_id, unread_count")
    .eq("user_id", userId)
    .eq("hidden", false);

  const parts = partRows ?? [];
  const roomIds = [...new Set((parts as { room_id: string }[]).map((p) => p.room_id).filter(Boolean))];

  let storeOrderParticipantUnread = 0;
  let otherParticipantUnread = 0;
  const linkedKeys = new Set<string>();

  if (roomIds.length > 0) {
    const { data: crRows } = await sbAny
      .from("chat_rooms")
      .select("id, room_type, item_id, seller_id, buyer_id")
      .in("id", roomIds);

    const metaByRoom = new Map(
      (crRows ?? []).map((r: { id: string; room_type?: string; item_id?: string | null; seller_id?: string; buyer_id?: string }) => [
        r.id,
        r,
      ])
    );

    for (const p of parts as { room_id: string; unread_count?: number }[]) {
      const c = p.unread_count ?? 0;
      const meta = metaByRoom.get(p.room_id) as
        | { room_type?: string; item_id?: string | null; seller_id?: string; buyer_id?: string }
        | undefined;
      const rt = meta?.room_type ?? "";
      if (rt === "store_order") {
        storeOrderParticipantUnread += c;
      } else {
        otherParticipantUnread += c;
      }
      if (rt === "item_trade" && meta?.item_id && meta?.seller_id && meta?.buyer_id) {
        linkedKeys.add(`${meta.item_id}|${meta.seller_id}|${meta.buyer_id}`);
      }
    }
  }

  let productChatUnreadDeduped = 0;
  const { data: pcRows, error: pcErr } = await sbAny
    .from("product_chats")
    .select("post_id, seller_id, buyer_id, unread_count_seller, unread_count_buyer")
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);

  if (!pcErr && pcRows?.length) {
    for (const r of pcRows as {
      post_id: string;
      seller_id: string;
      buyer_id: string;
      unread_count_seller?: number;
      unread_count_buyer?: number;
    }[]) {
      const key = `${r.post_id}|${r.seller_id}|${r.buyer_id}`;
      if (linkedKeys.has(key)) continue;
      const amISeller = r.seller_id === userId;
      productChatUnreadDeduped += amISeller ? (r.unread_count_seller ?? 0) : (r.unread_count_buyer ?? 0);
    }
  }

  return {
    storeOrderParticipantUnread,
    otherParticipantUnread,
    productChatUnreadDeduped,
  };
}

export function sumUserChatUnread(parts: UserChatUnreadParts): number {
  return (
    parts.storeOrderParticipantUnread + parts.otherParticipantUnread + parts.productChatUnreadDeduped
  );
}

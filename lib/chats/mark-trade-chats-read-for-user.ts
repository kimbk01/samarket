/**
 * 거래 채널만 읽음 처리 — `chatUnread`(item_trade 커서 + product_chats) 집계와 동일 범위.
 * 커뮤니티 메신저·매장 주문 채팅·기타 chat_rooms 참가자 `unread_count` 는 건드리지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";
import { invalidateUserChatUnreadCache, participantRowActive } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

export async function markTradeChatChannelsReadForUser(
  sbAny: SupabaseClient<any>,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  const { data: partRowsRaw, error: partSelErr } = await sbAny
    .from("chat_room_participants")
    .select("room_id, hidden, left_at, is_active")
    .eq("user_id", userId)
    .eq("hidden", false);

  if (partSelErr) {
    return { ok: false, error: partSelErr.message ?? "participants select failed" };
  }

  const parts = (partRowsRaw ?? []).filter(participantRowActive);
  const roomIds = [...new Set(parts.map((p: { room_id: string }) => String(p.room_id ?? "").trim()).filter(Boolean))];

  const itemTradeRooms: { id: string; last_message_id: string | null }[] = [];
  if (roomIds.length > 0) {
    for (const ids of chunkIds(roomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
      const { data: trRows, error: trErr } = await sbAny
        .from("chat_rooms")
        .select("id, last_message_id")
        .eq("room_type", "item_trade")
        .in("id", ids);
      if (trErr) {
        return { ok: false, error: trErr.message ?? "chat_rooms select failed" };
      }
      for (const r of trRows ?? []) {
        const id = String((r as { id?: string }).id ?? "").trim();
        if (!id) continue;
        itemTradeRooms.push({
          id,
          last_message_id: (r as { last_message_id?: string | null }).last_message_id ?? null,
        });
      }
    }

    const itemTradeRoomIds = itemTradeRooms.map((r) => r.id);
    for (const ids of chunkIds(itemTradeRoomIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
      const { error: msgErr } = await sbAny
        .from("chat_messages")
        .update({ read_at: now })
        .in("room_id", ids)
        .is("read_at", null)
        .or(`sender_id.is.null,sender_id.neq.${userId}`);
      if (msgErr) {
        return { ok: false, error: msgErr.message ?? "chat_messages update failed" };
      }
    }

    for (const row of itemTradeRooms) {
      const { error: upErr } = await sbAny
        .from("chat_room_participants")
        .update({
          last_read_message_id: row.last_message_id ?? null,
          unread_count: 0,
          last_read_at: now,
          updated_at: now,
        })
        .eq("room_id", row.id)
        .eq("user_id", userId);
      if (upErr) {
        return { ok: false, error: upErr.message ?? "participant update failed" };
      }
    }
  }

  const [{ error: pcSellErr }, { error: pcBuyErr }] = await Promise.all([
    sbAny.from("product_chats").update({ unread_count_seller: 0, updated_at: now }).eq("seller_id", userId),
    sbAny.from("product_chats").update({ unread_count_buyer: 0, updated_at: now }).eq("buyer_id", userId),
  ]);

  if (pcSellErr || pcBuyErr) {
    return { ok: false, error: (pcSellErr ?? pcBuyErr)?.message ?? "product_chats update failed" };
  }

  const { data: legacyRoomRows, error: legErr } = await sbAny
    .from("product_chats")
    .select("id")
    .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
    .limit(5000);

  if (legErr) {
    return { ok: false, error: legErr.message ?? "legacy rooms select failed" };
  }

  const legacyIds = [
    ...new Set((legacyRoomRows ?? []).map((r: { id: string }) => String(r.id ?? "").trim()).filter(Boolean)),
  ];

  for (const ids of chunkIds(legacyIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
    const { error: lmErr } = await sbAny
      .from("product_chat_messages")
      .update({ read_at: now })
      .in("product_chat_id", ids)
      .is("read_at", null)
      .or(`sender_id.is.null,sender_id.neq.${userId}`);
    if (lmErr) {
      return { ok: false, error: lmErr.message ?? "legacy messages update failed" };
    }
  }

  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);

  return { ok: true };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { bumpUnreadForChatRoomRecipients } from "@/lib/chats/chat-room-unread";
import { touchProductChatAfterItemTradeMessage } from "@/lib/trade/touch-product-chat-from-item-trade-room";

const TRADE_ITEM_DIRECT_KEY_PREFIX = "trade_item:";

/** `community_messenger_rooms.direct_key` → 통합 `chat_rooms.id`(item_trade) */
export function itemTradeChatRoomIdFromMessengerDirectKey(directKey: unknown): string | null {
  const k = typeof directKey === "string" ? directKey.trim() : "";
  if (!k.startsWith(TRADE_ITEM_DIRECT_KEY_PREFIX)) return null;
  const id = k.slice(TRADE_ITEM_DIRECT_KEY_PREFIX.length).trim();
  return id || null;
}

/**
 * CM 텍스트 전송 직후 `chat_messages`·`chat_rooms` 원장을 맞춤.
 * 하단 거래 배지·`tradeListUnreadHintFromCursor`·푸시 큐(`bumpUnreadForChatRoomRecipients`)는 item_trade 행을 본다.
 */
export async function mirrorCommunityMessengerTextToItemTradeLedger(
  sb: SupabaseClient<any>,
  input: {
    itemTradeChatRoomId: string;
    senderUserId: string;
    textContent: string;
    createdAt: string;
  }
): Promise<void> {
  const roomId = input.itemTradeChatRoomId.trim();
  const sender = input.senderUserId.trim();
  const content = input.textContent;
  if (!roomId || !sender) return;

  const { data: room, error: roomErr } = await sb
    .from("chat_rooms")
    .select("id, room_type, item_id, seller_id, buyer_id")
    .eq("id", roomId)
    .eq("room_type", "item_trade")
    .maybeSingle();
  if (roomErr || !room) return;

  const preview = content.length > 120 ? `${content.slice(0, 117)}…` : content || "메시지";

  const { data: msg, error: insErr } = await sb
    .from("chat_messages")
    .insert({
      room_id: roomId,
      sender_id: sender,
      message_type: "text",
      body: content || "(메시지)",
      metadata: { source: "community_messenger" },
    })
    .select("id, created_at")
    .single();
  if (insErr || !msg) return;

  const now = String((msg as { created_at?: string }).created_at ?? input.createdAt);
  const msgId = String((msg as { id?: string }).id ?? "");
  if (!msgId) return;

  await sb
    .from("chat_rooms")
    .update({
      last_message_id: msgId,
      last_message_at: now,
      last_message_preview: preview,
      updated_at: now,
    })
    .eq("id", roomId);

  const r = room as { item_id?: string | null; seller_id?: string | null; buyer_id?: string | null };
  if (r.item_id && r.seller_id && r.buyer_id) {
    await touchProductChatAfterItemTradeMessage(
      sb,
      {
        item_id: r.item_id,
        seller_id: r.seller_id,
        buyer_id: r.buyer_id,
        last_message_at: now,
        last_message_preview: preview,
      },
      sender
    ).catch(() => {
      /* 베스트에포트 */
    });
  }

  const { recipientUserIds } = await bumpUnreadForChatRoomRecipients(sb, roomId, sender, now, preview);
  const uidSet = new Set<string>([sender, ...recipientUserIds]);
  for (const uid of uidSet) {
    if (uid.trim()) invalidateUserChatUnreadCache(uid.trim());
  }
}

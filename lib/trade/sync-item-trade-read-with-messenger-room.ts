/**
 * 메신저 방에서 읽음 처리할 때, `community_messenger_room_id`로 묶인 `item_trade` 행과
 * `product_chats` 미읽음을 같이 맞춘다. 그렇지 않으면 `tradeListUnreadHintFromCursor`·PC 카운트가
 * 남아 탭/목록 병합 뱃지가 사라지지 않는다.
 *
 * @see app/api/chat/rooms/[roomId]/read/route.ts — 동일한 participant·메시지·PC 갱신 의미
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";

function trimId(value: unknown): string {
  return String(value ?? "").trim();
}

export async function syncItemTradeReadWithMessengerRoomMark(
  sbAny: SupabaseClient<any>,
  input: { userId: string; communityMessengerRoomId: string }
): Promise<void> {
  const uid = trimId(input.userId);
  const cmId = trimId(input.communityMessengerRoomId);
  if (!uid || !cmId) return;

  const { data: rows, error: selErr } = await sbAny
    .from("chat_rooms")
    .select("id, last_message_id, item_id, seller_id, buyer_id")
    .eq("room_type", "item_trade")
    .eq("community_messenger_room_id", cmId);

  if (selErr || !rows?.length) return;

  const now = new Date().toISOString();
  let touched = false;

  for (const cr of rows as Array<{
    id?: unknown;
    last_message_id?: string | null;
    item_id?: string | null;
    seller_id?: string | null;
    buyer_id?: string | null;
  }>) {
    const itemTradeRoomId = trimId(cr.id);
    if (!itemTradeRoomId) continue;
    const lastReadId = trimId(cr.last_message_id) || null;

    const { data: updated, error: upErr } = await sbAny
      .from("chat_room_participants")
      .update({
        last_read_message_id: lastReadId,
        last_read_at: now,
        unread_count: 0,
        updated_at: now,
      })
      .eq("room_id", itemTradeRoomId)
      .eq("user_id", uid)
      .select("id");

    if (upErr || !updated?.length) continue;
    touched = true;

    let readThrough = now;
    if (lastReadId) {
      const { data: curRow } = await sbAny.from("chat_messages").select("created_at").eq("id", lastReadId).maybeSingle();
      const ct = (curRow as { created_at?: string } | null)?.created_at;
      if (typeof ct === "string" && ct.length > 0) readThrough = ct;
    }
    await sbAny
      .from("chat_messages")
      .update({ read_at: now })
      .eq("room_id", itemTradeRoomId)
      .neq("sender_id", uid)
      .lte("created_at", readThrough)
      .is("read_at", null);

    const itemId = trimId(cr.item_id);
    const sellerId = trimId(cr.seller_id);
    const buyerId = trimId(cr.buyer_id);
    if (itemId && sellerId && buyerId) {
      const pcUpdates: Record<string, unknown> = { updated_at: now };
      if (sellerId === uid) pcUpdates.unread_count_seller = 0;
      else if (buyerId === uid) pcUpdates.unread_count_buyer = 0;
      if (Object.keys(pcUpdates).length > 1) {
        await sbAny
          .from("product_chats")
          .update(pcUpdates)
          .eq("post_id", itemId)
          .eq("seller_id", sellerId)
          .eq("buyer_id", buyerId);
      }
    }
  }

  /** `item_trade` 행이 아직 없거나 FK가 비어 있어도 `product_chats` 미읽음만 남는 경우 */
  const { data: cmRoom } = await sbAny.from("community_messenger_rooms").select("summary").eq("id", cmId).maybeSingle();
  const meta = parseCommunityMessengerRoomContextMeta((cmRoom as { summary?: string | null } | null)?.summary ?? "");
  if (meta?.kind === "trade") {
    const pcid = trimId(meta.productChatId);
    if (pcid) {
      const { data: pc } = await sbAny.from("product_chats").select("seller_id, buyer_id").eq("id", pcid).maybeSingle();
      if (pc) {
        const sellerId = trimId((pc as { seller_id?: unknown }).seller_id);
        const buyerId = trimId((pc as { buyer_id?: unknown }).buyer_id);
        if (sellerId && buyerId && (uid === sellerId || uid === buyerId)) {
          const pcUpdates: Record<string, unknown> = { updated_at: now };
          if (sellerId === uid) pcUpdates.unread_count_seller = 0;
          else pcUpdates.unread_count_buyer = 0;
          const { error: pcErr } = await sbAny.from("product_chats").update(pcUpdates).eq("id", pcid);
          if (!pcErr) touched = true;
        }
      }
    }
  }

  if (touched) {
    invalidateUserChatUnreadCache(uid);
  }
}

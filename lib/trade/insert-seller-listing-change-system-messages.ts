import type { SupabaseClient } from "@supabase/supabase-js";
import { formatSellerListingChangeNoticeBody } from "@/lib/chat/postSellerListingChangeNotice";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { SELLER_LISTING_LABEL } from "@/lib/products/seller-listing-state";

function trimMid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

/**
 * 판매 단계 변경 시 통합 채팅·레거시·커뮤니티 메신저 스레드에 동일 시스템 안내 1건씩 기록한다.
 * (서비스 롤 — RLS와 무관하게 양쪽 참가자 Realtime 수신)
 */
export async function insertSellerListingChangeSystemMessagesServer(
  sb: SupabaseClient<any>,
  args: { postId: string; sellerUserId: string; nextState: SellerListingState }
): Promise<void> {
  const pid = args.postId.trim();
  if (!pid) return;
  const label = SELLER_LISTING_LABEL[args.nextState];
  const body = formatSellerListingChangeNoticeBody(label);
  const now = new Date().toISOString();

  const cmRoomIds = new Set<string>();

  const { data: crRows } = await sb
    .from("chat_rooms")
    .select("id, community_messenger_room_id")
    .eq("room_type", "item_trade")
    .eq("item_id", pid);

  for (const row of crRows ?? []) {
    const rid = String((row as { id?: unknown }).id ?? "").trim();
    if (!rid) continue;
    try {
      await sb.from("chat_messages").insert({
        room_id: rid,
        sender_id: args.sellerUserId,
        message_type: "system",
        body,
        metadata: {},
      });
    } catch {
      /* ignore: 스키마·RLS */
    }
    const mid = trimMid((row as { community_messenger_room_id?: unknown }).community_messenger_room_id);
    if (mid) cmRoomIds.add(mid);
  }

  const { data: pcRows } = await sb
    .from("product_chats")
    .select("id, community_messenger_room_id")
    .eq("post_id", pid);

  for (const row of pcRows ?? []) {
    const pc = row as { id?: unknown; community_messenger_room_id?: unknown };
    const pcid = String(pc.id ?? "").trim();
    if (pcid) {
      try {
        await sb.from("product_chat_messages").insert({
          product_chat_id: pcid,
          sender_id: args.sellerUserId,
          message_type: "system",
          content: body,
          image_url: null,
        });
      } catch {
        /* ignore */
      }
    }
    const mid = trimMid(pc.community_messenger_room_id);
    if (mid) cmRoomIds.add(mid);
  }

  for (const cmRoomId of cmRoomIds) {
    try {
      const { error: insErr } = await sb.from("community_messenger_messages").insert({
        room_id: cmRoomId,
        sender_id: null,
        message_type: "system",
        content: body,
        metadata: {},
        created_at: now,
      });
      if (insErr) continue;
      await sb
        .from("community_messenger_rooms")
        .update({
          last_message: body,
          last_message_at: now,
          last_message_type: "system",
          updated_at: now,
        })
        .eq("id", cmRoomId);
      const { error: rpcErr } = await sb.rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: cmRoomId,
        p_sender_id: args.sellerUserId,
        p_read_at: now,
      });
      if (rpcErr) {
        /* unread RPC 실패해도 메시지는 남김 */
      }
    } catch {
      /* ignore */
    }
  }
}

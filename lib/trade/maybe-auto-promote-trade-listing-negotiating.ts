import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
import { participantRowActive } from "@/lib/chat/user-chat-unread-parts";
import { normalizeListingFromPostRow } from "@/lib/trade/seller-listing-chat-transitions";

type ParticipantRow = {
  room_id: string;
  user_id: string;
  hidden?: boolean;
  left_at?: string | null;
  is_active?: boolean | null;
};

/**
 * 물품(`posts`) 단위로 `seller_listing_state` 를 동기화한다.
 *
 * - **문의중(negotiating)**: 같은 글의 `item_trade`(또는 레거시 `product_chats`)에서
 *   구매자가 먼저 연 뒤 **판매자가 첫 답장을 포함해** 양쪽 모두 **일반 메시지(text/image)** 가 1건 이상이고,
 *   통합 방이면 판·구가 **아직 나가지 않은** 방이 **하나라도** 있으면 `negotiating`.
 * - **판매중(inquiry)**: 위 조건을 만족하는 방이 **없고**, 현재 단계가 `negotiating` 이면 `inquiry` 로 내린다.
 * - **예약중·거래완료** 는 이 함수에서 변경하지 않는다.
 *
 * 거래 목록·내 판매 등은 모두 `posts.seller_listing_state` 를 읽으므로 동일하게 반영된다.
 */
export async function syncPostInquiryNegotiatingFromItemTradeChats(
  sb: SupabaseClient<any>,
  postId: string
): Promise<void> {
  const pid = postId.trim();
  if (!pid) return;

  const { data: post, error: postErr } = await sb
    .from(POSTS_TABLE_READ)
    .select("id, user_id, status, seller_listing_state")
    .eq("id", pid)
    .maybeSingle();
  if (postErr || !post) return;

  const row = post as { user_id?: string; status?: string; seller_listing_state?: unknown };
  const st = String(row.status ?? "").toLowerCase();
  if (st !== "active") return;

  const listing = normalizeListingFromPostRow(row);
  if (listing === "reserved" || listing === "completed") return;

  const { data: rooms, error: rErr } = await sb
    .from("chat_rooms")
    .select("id, seller_id, buyer_id")
    .eq("room_type", "item_trade")
    .eq("item_id", pid);
  if (rErr) return;

  const roomList = (rooms ?? []) as { id: string; seller_id: string | null; buyer_id: string | null }[];
  const roomIds = roomList.map((r) => r.id).filter(Boolean);

  if (roomIds.length === 0) {
    const legacyOnly = await legacyProductChatsHaveBidirectionalMessages(sb, pid);
    const now = new Date().toISOString();
    if (legacyOnly && listing === "inquiry") {
      const { error: updErr } = await sb
        .from(POSTS_TABLE_WRITE)
        .update({ seller_listing_state: "negotiating", updated_at: now })
        .eq("id", pid)
        .or("seller_listing_state.eq.inquiry,seller_listing_state.is.null");
      if (!updErr) {
        try {
          await sb
            .from("chat_rooms")
            .update({ trade_status: "negotiating", updated_at: now })
            .eq("room_type", "item_trade")
            .eq("item_id", pid);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (!legacyOnly && listing === "negotiating") {
      await applyListingInquiry(sb, pid);
    }
    return;
  }

  const { data: partRows } = await sb
    .from("chat_room_participants")
    .select("room_id, user_id, hidden, left_at, is_active")
    .in("room_id", roomIds);

  const partsByRoom = new Map<string, ParticipantRow[]>();
  for (const p of (partRows ?? []) as ParticipantRow[]) {
    const rid = p.room_id;
    const arr = partsByRoom.get(rid) ?? [];
    arr.push(p);
    partsByRoom.set(rid, arr);
  }

  const { data: msgRows } = await sb
    .from("chat_messages")
    .select("room_id, sender_id")
    .in("room_id", roomIds)
    .in("message_type", ["text", "image"]);

  const sendersByRoom = new Map<string, Set<string>>();
  for (const m of msgRows ?? []) {
    const mr = m as { room_id: string; sender_id: string };
    if (!mr.room_id || !mr.sender_id) continue;
    if (!sendersByRoom.has(mr.room_id)) sendersByRoom.set(mr.room_id, new Set());
    sendersByRoom.get(mr.room_id)!.add(mr.sender_id);
  }

  let hasActiveConversation = false;
  for (const room of roomList) {
    const sid = room.seller_id?.trim() ?? "";
    const bid = room.buyer_id?.trim() ?? "";
    if (!sid || !bid) continue;
    const parts = partsByRoom.get(room.id) ?? [];
    const sellerPart = parts.find((p) => p.user_id === sid);
    const buyerPart = parts.find((p) => p.user_id === bid);
    const senders = sendersByRoom.get(room.id);
    if (!senders?.has(sid) || !senders.has(bid)) continue;
    if (sellerPart && buyerPart) {
      if (!participantRowActive(sellerPart) || !participantRowActive(buyerPart)) continue;
    } else {
      if (sellerPart && !participantRowActive(sellerPart)) continue;
      if (buyerPart && !participantRowActive(buyerPart)) continue;
    }
    hasActiveConversation = true;
    break;
  }

  if (!hasActiveConversation) {
    hasActiveConversation = await legacyProductChatsHaveBidirectionalMessages(sb, pid);
  }

  const now = new Date().toISOString();

  if (hasActiveConversation && listing === "inquiry") {
    const { error: updErr } = await sb
      .from(POSTS_TABLE_WRITE)
      .update({ seller_listing_state: "negotiating", updated_at: now })
      .eq("id", pid)
      .or("seller_listing_state.eq.inquiry,seller_listing_state.is.null");
    if (updErr) return;
    try {
      await sb
        .from("chat_rooms")
        .update({ trade_status: "negotiating", updated_at: now })
        .eq("room_type", "item_trade")
        .eq("item_id", pid);
    } catch {
      /* ignore */
    }
    return;
  }

  if (!hasActiveConversation && listing === "negotiating") {
    await applyListingInquiry(sb, pid);
  }
}

/**
 * 레거시 `product_chats` / `product_chat_messages` 만 쓰는 채팅(통합 chat_messages 미기록)도 동일 기준으로 본다.
 */
async function legacyProductChatsHaveBidirectionalMessages(
  sb: SupabaseClient<any>,
  postId: string
): Promise<boolean> {
  const { data: pcs, error } = await sb
    .from("product_chats")
    .select("id, seller_id, buyer_id, seller_left_at, buyer_left_at")
    .eq("post_id", postId.trim());
  if (error || !pcs?.length) return false;
  const pcIds = (pcs as { id: string }[]).map((p) => p.id).filter(Boolean);
  if (pcIds.length === 0) return false;

  const { data: msgs } = await sb
    .from("product_chat_messages")
    .select("product_chat_id, sender_id")
    .in("product_chat_id", pcIds)
    .in("message_type", ["text", "image"]);

  for (const pc of pcs as {
    id: string;
    seller_id: string | null;
    buyer_id: string | null;
    seller_left_at?: string | null;
    buyer_left_at?: string | null;
  }[]) {
    if (pc.seller_left_at || pc.buyer_left_at) continue;
    const sid = pc.seller_id?.trim() ?? "";
    const bid = pc.buyer_id?.trim() ?? "";
    if (!sid || !bid) continue;
    const senders = new Set<string>();
    for (const m of msgs ?? []) {
      const row = m as { product_chat_id?: string; sender_id?: string };
      if (row.product_chat_id === pc.id && row.sender_id) senders.add(row.sender_id.trim());
    }
    if (senders.has(sid) && senders.has(bid)) return true;
  }
  return false;
}

async function applyListingInquiry(sb: SupabaseClient<any>, postId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error: updErr } = await sb
    .from(POSTS_TABLE_WRITE)
    .update({ seller_listing_state: "inquiry", updated_at: now })
    .eq("id", postId)
    .eq("seller_listing_state", "negotiating");
  if (updErr) return;
  try {
    await sb
      .from("chat_rooms")
      .update({ trade_status: "inquiry", updated_at: now })
      .eq("room_type", "item_trade")
      .eq("item_id", postId);
  } catch {
    /* ignore */
  }
}

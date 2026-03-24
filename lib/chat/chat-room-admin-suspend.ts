/**
 * chat_rooms.is_blocked / is_locked 와 blocked_by 가
 * 참여자(판매자·구매자 등)인지에 따라 「운영(관리자) 조치」로 채팅을 막을지 판별합니다.
 * — 사용자 간 방 차단은 blocked_by 가 방 참여자입니다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminChatSuspendReason = "admin_locked" | "admin_moderation_block";

export function resolveAdminChatSuspension(row: {
  is_blocked?: boolean | null;
  is_locked?: boolean | null;
  blocked_by?: string | null;
  seller_id?: string | null;
  buyer_id?: string | null;
  initiator_id?: string | null;
  peer_id?: string | null;
}): { suspended: boolean; reason: AdminChatSuspendReason | null } {
  if (row.is_locked) {
    return { suspended: true, reason: "admin_locked" };
  }
  if (!row.is_blocked || !row.blocked_by) {
    return { suspended: false, reason: null };
  }
  const parts = [row.seller_id, row.buyer_id, row.initiator_id, row.peer_id].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  const blockerInRoom = parts.includes(row.blocked_by);
  if (!blockerInRoom) {
    return { suspended: true, reason: "admin_moderation_block" };
  }
  return { suspended: false, reason: null };
}

export const ADMIN_CHAT_SUSPENDED_MESSAGE =
  "관리자에 의해 이 채팅방에서는 대화할 수 없습니다.";

/** 글·판매자·구매자로 연결된 item_trade 방의 운영 조치 여부 */
export async function fetchItemTradeAdminSuspended(
  sbAny: SupabaseClient<any>,
  postId: string,
  sellerId: string,
  buyerId: string
): Promise<boolean> {
  const pid = postId.trim();
  const sid = sellerId.trim();
  const bid = buyerId.trim();
  if (!pid || !sid || !bid) return false;
  const { data } = await sbAny
    .from("chat_rooms")
    .select("is_blocked, blocked_by, is_locked, seller_id, buyer_id, initiator_id, peer_id")
    .eq("room_type", "item_trade")
    .eq("item_id", pid)
    .eq("seller_id", sid)
    .eq("buyer_id", bid)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? resolveAdminChatSuspension(data).suspended : false;
}

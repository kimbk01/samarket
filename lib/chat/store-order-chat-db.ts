/**
 * 매장 주문(store_order) chat_rooms 접근: buyer/seller + 참가자 행(unread) 검증
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type StoreOrderChatRoomAccess =
  | { ok: false }
  | { ok: true; sellerId: string; buyerId: string; unreadCount: number };

export async function ensureStoreOrderChatRoomAccessForUser(
  sb: SupabaseClient,
  roomId: string,
  userId: string
): Promise<StoreOrderChatRoomAccess> {
  const { data: cr } = await sb
    .from("chat_rooms")
    .select("id, room_type, seller_id, buyer_id")
    .eq("id", roomId)
    .maybeSingle();
  const rt = (cr as { room_type?: string | null } | null)?.room_type ?? "";
  if (rt !== "store_order") {
    return { ok: false };
  }
  const row = cr as { seller_id?: string | null; buyer_id?: string | null } | null;
  const sellerId = String(row?.seller_id ?? "");
  const buyerId = String(row?.buyer_id ?? "");
  if (!sellerId || !buyerId) {
    return { ok: false };
  }
  if (userId !== sellerId && userId !== buyerId) {
    return { ok: false };
  }

  const { data: part } = await sb
    .from("chat_room_participants")
    .select("unread_count, hidden, left_at, is_active")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  const pr = part as {
    unread_count?: number | null;
    hidden?: boolean | null;
    left_at?: string | null;
    is_active?: boolean | null;
  } | null;

  if (pr) {
    if (pr.hidden || pr.left_at || pr.is_active === false) {
      return { ok: false };
    }
    return {
      ok: true,
      sellerId,
      buyerId,
      unreadCount: Number(pr.unread_count ?? 0),
    };
  }

  // 참가자 행이 아직 없는 레거시/마이그레이션 직후: 방의 buyer/seller만으로 허용
  return { ok: true, sellerId, buyerId, unreadCount: 0 };
}

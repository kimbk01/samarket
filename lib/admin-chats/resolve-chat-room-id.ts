import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 관리자 채팅 조치·상세에서 product_chats id → 연결된 chat_rooms.id 해석
 */

export async function resolveChatRoomId(sbAny: SupabaseClient<any>, id: string): Promise<string | null> {
  const { data: direct } = await sbAny.from("chat_rooms").select("id").eq("id", id).maybeSingle();
  if (direct && (direct as { id?: string }).id) return (direct as { id: string }).id;

  const { data: pc } = await sbAny
    .from("product_chats")
    .select("post_id, seller_id, buyer_id")
    .eq("id", id)
    .maybeSingle();
  const row = pc as { post_id?: string; seller_id?: string; buyer_id?: string } | null;
  if (!row?.post_id || !row.seller_id || !row.buyer_id) return null;
  const { data: cr } = await sbAny
    .from("chat_rooms")
    .select("id")
    .eq("room_type", "item_trade")
    .eq("item_id", row.post_id)
    .eq("seller_id", row.seller_id)
    .eq("buyer_id", row.buyer_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return cr && (cr as { id?: string }).id ? (cr as { id: string }).id : null;
}

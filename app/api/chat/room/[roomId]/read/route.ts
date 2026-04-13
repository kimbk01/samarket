/**
 * 채팅방 읽음 처리 (서비스 롤)
 * POST (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { parseRoomId } from "@/lib/validate-params";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { roomId: raw } = await params;
  const roomId = parseRoomId(raw);
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const { data: room, error: roomErr } = await sbAny
    .from("product_chats")
    .select("id, post_id, seller_id, buyer_id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !room) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  if (room.seller_id !== userId && room.buyer_id !== userId) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const isSeller = room.seller_id === userId;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (isSeller) {
    updates.unread_count_seller = 0;
  } else {
    updates.unread_count_buyer = 0;
  }

  await sbAny.from("product_chats").update(updates).eq("id", roomId);

  /** 동일 거래의 통합 chat_rooms 참가자 미읽음도 0 */
  try {
    const postId = (room as { post_id?: string }).post_id;
    if (postId && room.seller_id && room.buyer_id) {
      const { data: cr } = await sbAny
        .from("chat_rooms")
        .select("id")
        .eq("room_type", "item_trade")
        .eq("item_id", postId)
        .eq("seller_id", room.seller_id)
        .eq("buyer_id", room.buyer_id)
        .maybeSingle();
      const crId = (cr as { id?: string } | null)?.id;
      if (crId) {
        await sbAny
          .from("chat_room_participants")
          .update({
            unread_count: 0,
            last_read_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("room_id", crId)
          .eq("user_id", userId);
      }
    }
  } catch {
    /* ignore */
  }

  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  return NextResponse.json({ ok: true });
}

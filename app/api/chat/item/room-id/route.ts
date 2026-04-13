import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * GET /api/chat/item/room-id — 해당 상품에 대한 현재 사용자의 기존 채팅방 ID 조회
 * Query: itemId (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import type { ChatRoomSource } from "@/lib/types/chat";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId")?.trim() ?? "";
  const userId = (await getOptionalAuthenticatedUserId()) ?? "";
  if (!itemId || !userId) {
    return NextResponse.json({ roomId: null, source: null });
  }

  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ roomId: null, source: null });
  }

  const sbAny = sb;
  const { data: post } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, user_id")
    .eq("id", itemId)
    .maybeSingle();
  const sellerId = postAuthorUserId((post ?? {}) as Record<string, unknown>);
  if (!sellerId) {
    return NextResponse.json({ roomId: null, source: null });
  }
  /** 판매자 본인에게는 특정 구매자 방 1개를 고를 수 없으므로 미연동(목록에서 진입) */
  if (userId === sellerId) {
    return NextResponse.json({ roomId: null, source: null });
  }

  const { data: crRows } = await sbAny
    .from("chat_rooms")
    .select("id")
    .eq("room_type", "item_trade")
    .eq("item_id", itemId)
    .eq("buyer_id", userId)
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(1);
  const crId = crRows?.[0]?.id as string | undefined;
  if (crId) {
    return NextResponse.json({ roomId: crId, source: "chat_room" satisfies ChatRoomSource });
  }

  const { data: pcRows } = await sbAny
    .from("product_chats")
    .select("id")
    .eq("post_id", itemId)
    .eq("buyer_id", userId)
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    roomId: (pcRows?.[0] as { id?: string } | undefined)?.id ?? null,
    source: pcRows?.[0] ? ("product_chat" satisfies ChatRoomSource) : null,
  });
}

import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

/**
 * GET /api/chat/item/room-id — 해당 상품에 대한 현재 사용자의 기존 채팅방 ID 조회
 * Query: itemId (세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveViewerItemTradeRoom } from "@/lib/chats/resolve-viewer-item-trade-room";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId")?.trim() ?? "";
  const userId = (await getOptionalAuthenticatedUserId()) ?? "";
  if (!itemId || !userId) {
    return NextResponse.json({ roomId: null, source: null, messengerRoomId: null });
  }

  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ roomId: null, source: null, messengerRoomId: null });
  }

  const sbAny = sb;
  const { data: post } = await sbAny
    .from(POSTS_TABLE_READ)
    .select("id, user_id")
    .eq("id", itemId)
    .maybeSingle();
  const sellerId = postAuthorUserId((post ?? {}) as Record<string, unknown>);
  if (!sellerId) {
    return NextResponse.json({ roomId: null, source: null, messengerRoomId: null });
  }

  const resolved = await resolveViewerItemTradeRoom(sbAny, {
    itemId,
    viewerUserId: userId,
    sellerId,
  });

  return NextResponse.json({
    roomId: resolved.roomId,
    source: resolved.source,
    messengerRoomId: resolved.messengerRoomId,
  });
}

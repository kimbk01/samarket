import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";

/**
 * GET /api/chat/rooms/:roomId — 채팅방 상세 (chat_rooms 기반, 세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  CHAT_ROOM_ITEM_TRADE_API_SELECT,
  CHAT_ROOM_PARTICIPANT_API_SELECT,
} from "@/lib/chat/chat-sql-selects";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const [{ data: room, error: roomErr }, { data: allParticipants, error: partListErr }] = await Promise.all([
    sbAny.from("chat_rooms").select(CHAT_ROOM_ITEM_TRADE_API_SELECT).eq("id", roomId).maybeSingle(),
    sbAny.from("chat_room_participants").select(CHAT_ROOM_PARTICIPANT_API_SELECT).eq("room_id", roomId),
  ]);

  if (roomErr || !room) {
    return NextResponse.json({ error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  if ((room as { room_type?: string | null }).room_type !== "item_trade") {
    return NextResponse.json({ error: "삭제된 채팅 유형입니다." }, { status: 404 });
  }
  if (partListErr) {
    return NextResponse.json({ error: partListErr.message }, { status: 500 });
  }
  const rows = (allParticipants ?? []) as { user_id?: string }[];
  const me = rows.find((p) => p.user_id === userId);
  if (!me) {
    return NextResponse.json({ error: "참여자만 조회할 수 있습니다." }, { status: 403 });
  }

  let item: Record<string, unknown> | null = null;
  if ((room as { item_id: string | null }).item_id) {
    const { data: post } = await sbAny
      .from(POSTS_TABLE_READ)
      .select("id, title, content, price, status, user_id")
      .eq("id", (room as { item_id: string }).item_id)
      .maybeSingle();
    if (post) item = post as Record<string, unknown>;
  }

  return NextResponse.json({
    room: {
      id: room.id,
      roomType: room.room_type,
      itemId: (room as { item_id: string | null }).item_id,
      contextType: (room as { context_type: string | null }).context_type,
      sellerId: (room as { seller_id: string | null }).seller_id,
      buyerId: (room as { buyer_id: string | null }).buyer_id,
      initiatorId: (room as { initiator_id: string }).initiator_id,
      peerId: (room as { peer_id: string | null }).peer_id,
      requestStatus: (room as { request_status: string }).request_status,
      tradeStatus: (room as { trade_status: string }).trade_status,
      lastMessageAt: (room as { last_message_at: string | null }).last_message_at,
      lastMessagePreview: (room as { last_message_preview: string | null }).last_message_preview,
      isBlocked: (room as { is_blocked: boolean }).is_blocked,
      isLocked: (room as { is_locked: boolean }).is_locked,
      createdAt: (room as { created_at: string }).created_at,
      reopenedAt: (room as { reopened_at: string | null }).reopened_at,
    },
    participants: rows,
    item,
  });
}

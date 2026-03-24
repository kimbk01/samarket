/**
 * POST /api/chat/rooms/:roomId/read — 읽음 처리 (세션)
 * Body: { messageId? } — messageId 없으면 마지막 메시지 기준
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  let body: { messageId?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : null;
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  let lastReadId = messageId;
  if (!lastReadId) {
    const { data: room } = await sbAny.from("chat_rooms").select("last_message_id").eq("id", roomId).maybeSingle();
    lastReadId = (room as { last_message_id: string | null } | null)?.last_message_id ?? null;
  }
  const now = new Date().toISOString();
  const { error: upErr } = await sbAny
    .from("chat_room_participants")
    .update({
      last_read_message_id: lastReadId,
      last_read_at: now,
      unread_count: 0,
      updated_at: now,
    })
    .eq("room_id", roomId)
    .eq("user_id", userId);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  /** 거래 통합방(chat_rooms) 읽음 시 legacy product_chats 미읽음도 같이 0 — 배지 이중 집계 방지 */
  try {
    const { data: cr } = await sbAny
      .from("chat_rooms")
      .select("room_type, item_id, seller_id, buyer_id")
      .eq("id", roomId)
      .maybeSingle();
    const row = cr as
      | { room_type?: string; item_id?: string | null; seller_id?: string; buyer_id?: string }
      | null;
    if (row?.room_type === "item_trade" && row.item_id && row.seller_id && row.buyer_id) {
      const pcUpdates: Record<string, unknown> = { updated_at: now };
      if (row.seller_id === userId) pcUpdates.unread_count_seller = 0;
      else if (row.buyer_id === userId) pcUpdates.unread_count_buyer = 0;
      if (Object.keys(pcUpdates).length > 1) {
        await sbAny
          .from("product_chats")
          .update(pcUpdates)
          .eq("post_id", row.item_id)
          .eq("seller_id", row.seller_id)
          .eq("buyer_id", row.buyer_id);
      }
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}

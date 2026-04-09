/**
 * POST /api/chat/rooms/:roomId/read — 읽음 처리 (세션)
 * Body: { messageId? } — messageId 없으면 마지막 메시지 기준
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
type ChatRowForRead = {
  room_type?: string | null;
  meeting_id?: string | null;
  related_group_id?: string | null;
};

/** 참가자 행이 있어야 읽음 처리합니다. */
async function ensureParticipantReadState(
  sbAny: SupabaseClient<any>,
  roomId: string,
  userId: string,
  lastReadId: string | null,
  now: string,
  _chatRow: ChatRowForRead,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: updated, error: upErr } = await sbAny
    .from("chat_room_participants")
    .update({
      last_read_message_id: lastReadId,
      last_read_at: now,
      unread_count: 0,
      updated_at: now,
    })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .select("id");

  if (upErr) return { ok: false, error: upErr.message };
  if (updated?.length) return { ok: true };
  return { ok: false, error: "채팅 참가자가 아닙니다." };
}

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

  const { data: crRow, error: crErr } = await sb
    .from("chat_rooms")
    .select(
      "id, last_message_id, room_type, meeting_id, related_group_id, item_id, seller_id, buyer_id"
    )
    .eq("id", roomId)
    .maybeSingle();
  const sbAny = sb;
  if (crErr || !crRow) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  const cr = crRow as {
    last_message_id?: string | null;
    room_type?: string | null;
    meeting_id?: string | null;
    related_group_id?: string | null;
  };
  if (cr.room_type !== "item_trade") {
    return NextResponse.json({ ok: false, error: "삭제된 채팅 유형입니다." }, { status: 404 });
  }
  let lastReadId = messageId;
  if (!lastReadId) {
    lastReadId = typeof cr.last_message_id === "string" ? cr.last_message_id : null;
  }
  const now = new Date().toISOString();

  const ensured = await ensureParticipantReadState(sbAny, roomId, userId, lastReadId, now, cr);
  if (!ensured.ok) {
    return NextResponse.json({ ok: false, error: ensured.error }, { status: 403 });
  }

  /** 상대가 본 시점: 내가 보낸 메시지에 read_at (상대 화면 «읽음») — last_read 기준 시각까지 */
  let readThrough = now;
  if (lastReadId) {
    const { data: curRow } = await sbAny.from("chat_messages").select("created_at").eq("id", lastReadId).maybeSingle();
    const ct = (curRow as { created_at?: string } | null)?.created_at;
    if (typeof ct === "string" && ct.length > 0) readThrough = ct;
  }
  await sbAny
    .from("chat_messages")
    .update({ read_at: now })
    .eq("room_id", roomId)
    .neq("sender_id", userId)
    .lte("created_at", readThrough)
    .is("read_at", null);

  /** 거래 통합방(chat_rooms) 읽음 시 legacy product_chats 미읽음도 같이 0 — 배지 이중 집계 방지 */
  try {
    const row = crRow as
      | { room_type?: string; item_id?: string | null; seller_id?: string | null; buyer_id?: string | null }
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

  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/chat/rooms/:roomId/leave — 채팅방 나가기 (soft, 세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const now = new Date().toISOString();
  const { data: roomRow, error: roomErr } = await sbAny
    .from("chat_rooms")
    .select("id, room_type")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRow) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }
  if ((roomRow as { room_type?: string | null }).room_type !== "item_trade") {
    return NextResponse.json({ ok: false, error: "삭제된 채팅 유형입니다." }, { status: 404 });
  }
  const { data: part, error: upErr } = await sbAny
    .from("chat_room_participants")
    .update({
      left_at: now,
      is_active: false,
      hidden: true,
      updated_at: now,
    })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (upErr || !part) {
    return NextResponse.json({ ok: false, error: "참여 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  /* 활성 참가자가 더 없으면 방 잠금 — 유령 대화·뱃지용 미읽음 정리 */
  const { data: stillRows } = await sbAny
    .from("chat_room_participants")
    .select("id, is_active")
    .eq("room_id", roomId)
    .eq("hidden", false)
    .is("left_at", null);
  const activeOthers = (stillRows ?? []).filter((row: { is_active?: boolean | null }) => row.is_active !== false);
  if (activeOthers.length === 0) {
    await sbAny
      .from("chat_rooms")
      .update({ is_locked: true, locked_at: now, updated_at: now })
      .eq("id", roomId);
  }

  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "participant_left",
      actor_user_id: userId,
      metadata: {},
    });
  } catch {
    /* ignore */
  }
  invalidateUserChatUnreadCache(userId);
  invalidateOwnerHubBadgeCache(userId);
  return NextResponse.json({ ok: true });
}

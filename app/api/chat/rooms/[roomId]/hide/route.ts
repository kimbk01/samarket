/**
 * POST /api/chat/rooms/:roomId/hide — 채팅방 숨기기(유저 기준 삭제, 세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

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
  const { data: part, error: upErr } = await sbAny
    .from("chat_room_participants")
    .update({ hidden: true, updated_at: now })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (upErr || !part) {
    return NextResponse.json({ ok: false, error: "참여 정보를 찾을 수 없습니다." }, { status: 404 });
  }
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "participant_hidden",
      actor_user_id: userId,
      metadata: {},
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}

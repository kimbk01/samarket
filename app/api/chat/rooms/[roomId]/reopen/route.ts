/**
 * POST /api/chat/rooms/:roomId/reopen — 다시 채팅하기(복구, 세션)
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
  const { data: part } = await sbAny
    .from("chat_room_participants")
    .select("id, reopen_count")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!part) {
    return NextResponse.json({ ok: false, error: "참여 정보를 찾을 수 없습니다." }, { status: 404 });
  }
  const now = new Date().toISOString();
  const count = ((part as { reopen_count?: number }).reopen_count ?? 0) + 1;
  await sbAny
    .from("chat_room_participants")
    .update({
      hidden: false,
      left_at: null,
      is_active: true,
      reopen_count: count,
      updated_at: now,
    })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  await sbAny.from("chat_rooms").update({ reopened_at: now, updated_at: now }).eq("id", roomId);
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: roomId,
      event_type: "room_reopened",
      actor_user_id: userId,
      metadata: { reopen_count: count },
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}

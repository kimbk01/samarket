/**
 * POST /api/group-chat/rooms/:roomId/read — 읽음 커서 (last_read_seq = room.message_seq)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { jsonError } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return jsonError("roomId 필요", 400);
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("서버 설정 필요", 500);
  }

  const { data: room, error: roomErr } = await sb
    .from("group_rooms")
    .select("id, message_seq, last_message_id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !(room as { id?: string } | null)?.id) {
    return jsonError("방을 찾을 수 없습니다.", 404);
  }

  const r = room as { message_seq: number; last_message_id: string | null };

  const { data: mem, error: memErr } = await sb
    .from("group_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", auth.userId)
    .is("left_at", null)
    .maybeSingle();

  if (memErr || !(mem as { id?: string } | null)?.id) {
    return jsonError("멤버만 읽음 처리할 수 있습니다.", 403);
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("group_room_members")
    .update({
      last_read_seq: r.message_seq,
      last_read_message_id: r.last_message_id,
      updated_at: now,
    })
    .eq("room_id", roomId)
    .eq("user_id", auth.userId);

  if (upErr) {
    return jsonError(upErr.message, 500);
  }

  return NextResponse.json({ ok: true });
}

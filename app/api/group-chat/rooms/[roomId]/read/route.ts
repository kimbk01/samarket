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
    return jsonError("invalid_request", { status: 400, code: "invalid_request" });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("server_config", { status: 500, code: "server_config" });
  }

  const { data: room, error: roomErr } = await sb
    .from("group_rooms")
    .select("id, message_seq, last_message_id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !(room as { id?: string } | null)?.id) {
    return jsonError("room_not_found", { status: 404, code: "room_not_found" });
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
    return jsonError("not_member", { status: 403, code: "not_member" });
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

/**
 * POST /api/group-chat/rooms/:roomId/join — 그룹 방 참여
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

  const { data: room } = await sb.from("group_rooms").select("id, member_count").eq("id", roomId).maybeSingle();
  if (!(room as { id?: string } | null)?.id) {
    return jsonError("방을 찾을 수 없습니다.", 404);
  }

  const { data: existing } = await sb
    .from("group_room_members")
    .select("id, left_at")
    .eq("room_id", roomId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  const ex = existing as { id?: string; left_at?: string | null } | null;
  if (ex?.id && !ex.left_at) {
    return jsonError("이미 참여 중입니다.", 409);
  }

  const now = new Date().toISOString();

  if (ex?.id && ex.left_at) {
    const { error: upErr } = await sb
      .from("group_room_members")
      .update({ left_at: null, joined_at: now, updated_at: now, role: "member" })
      .eq("id", ex.id);
    if (upErr) return jsonError(upErr.message, 500);
  } else {
    const { error: insErr } = await sb.from("group_room_members").insert({
      room_id: roomId,
      user_id: auth.userId,
      role: "member",
    });
    if (insErr) return jsonError(insErr.message, 500);
  }

  const prev = Number((room as { member_count?: number }).member_count ?? 0);
  await sb
    .from("group_rooms")
    .update({ member_count: prev + 1, updated_at: now })
    .eq("id", roomId);

  return NextResponse.json({ ok: true });
}

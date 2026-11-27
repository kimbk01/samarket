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
    return jsonError("room_id_required", { status: 400, code: "room_id_required" });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("server_config", { status: 500, code: "server_config" });
  }

  const { data: room } = await sb.from("group_rooms").select("id, member_count").eq("id", roomId).maybeSingle();
  if (!(room as { id?: string } | null)?.id) {
    return jsonError("room_not_found", { status: 404, code: "room_not_found" });
  }

  const { data: existing } = await sb
    .from("group_room_members")
    .select("id, left_at")
    .eq("room_id", roomId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  const ex = existing as { id?: string; left_at?: string | null } | null;
  if (ex?.id && !ex.left_at) {
    return jsonError("group_chat_already_joined", { status: 409, code: "group_chat_already_joined" });
  }

  const now = new Date().toISOString();

  if (ex?.id && ex.left_at) {
    const { error: upErr } = await sb
      .from("group_room_members")
      .update({ left_at: null, joined_at: now, updated_at: now, role: "member" })
      .eq("id", ex.id);
    if (upErr) {
      console.error("[group-chat] join update failed", upErr.message);
      return jsonError("group_chat_join_failed", { status: 500, code: "group_chat_join_failed" });
    }
  } else {
    const { error: insErr } = await sb.from("group_room_members").insert({
      room_id: roomId,
      user_id: auth.userId,
      role: "member",
    });
    if (insErr) {
      console.error("[group-chat] join insert failed", insErr.message);
      return jsonError("group_chat_join_failed", { status: 500, code: "group_chat_join_failed" });
    }
  }

  const prev = Number((room as { member_count?: number }).member_count ?? 0);
  await sb
    .from("group_rooms")
    .update({ member_count: prev + 1, updated_at: now })
    .eq("id", roomId);

  return NextResponse.json({ ok: true });
}

/**
 * POST /api/admin/chat/rooms/:id/messages/bulk-unhide
 * Body: { reason?: string } — 관리자로 숨긴 비시스템 메시지 일괄 복구
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { id: roomId } = await params;
  const rid = roomId?.trim();
  if (!rid) return NextResponse.json({ ok: false, error: "roomId 필요" }, { status: 400 });

  let body: { reason?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const reasonMeta =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 500)
      : "관리자 일괄 숨김 해제";

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const sbAny = sb as any;
  const { data: room } = await sbAny.from("chat_rooms").select("id").eq("id", rid).maybeSingle();
  if (!room) {
    return NextResponse.json({ ok: false, error: "채팅방을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: updated, error } = await sbAny
    .from("chat_messages")
    .update({ is_hidden_by_admin: false, hidden_reason: null })
    .eq("room_id", rid)
    .eq("is_hidden_by_admin", true)
    .neq("message_type", "system")
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const n = updated?.length ?? 0;
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: rid,
      event_type: "message_hidden",
      actor_admin_id: admin.userId,
      metadata: { bulk_unhide: true, count: n, reason: reasonMeta },
    });
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true, unhidden_count: n });
}

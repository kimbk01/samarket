/**
 * POST /api/chat/messages/:id/hide — 관리자 메시지 숨김
 * Body: { reason?, adminId? }
 */
import { NextRequest, NextResponse } from "next/server";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { id: messageId } = await params;
  let body: { reason?: string; adminId?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const adminId = body.adminId?.trim();
  if (!messageId || !adminId) {
    return NextResponse.json({ ok: false, error: "messageId, adminId 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: profile } = await sbAny
    .from("profiles")
    .select("role")
    .eq("id", adminId)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (!isPrivilegedAdminRole(role)) {
    return NextResponse.json({ ok: false, error: "관리자만 메시지를 숨길 수 있습니다." }, { status: 403 });
  }

  const { data: msg } = await sbAny
    .from("chat_messages")
    .select("id, room_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) {
    return NextResponse.json({ ok: false, error: "메시지를 찾을 수 없습니다." }, { status: 404 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
  await sbAny
    .from("chat_messages")
    .update({ is_hidden_by_admin: true, hidden_reason: reason })
    .eq("id", messageId);
  try {
    await sbAny.from("chat_event_logs").insert({
      room_id: (msg as { room_id: string }).room_id,
      event_type: "message_hidden",
      actor_admin_id: adminId,
      metadata: { message_id: messageId },
    });
    await sbAny.from("moderation_actions").insert({
      target_type: "message",
      target_id: messageId,
      action_type: "hide_message",
      action_reason: reason ?? undefined,
      actor_admin_id: adminId,
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}

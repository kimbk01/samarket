/**
 * POST /api/chat/messages/:id/hide — 관리자 메시지 숨김
 * Body: { reason?, adminId? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
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
  // SEC-03: 세션 기반 관리자 인증. body.adminId 는 더 이상 신뢰하지 않는다.
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const adminId = admin.userId;
  let body: { reason?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  if (!messageId) {
    return NextResponse.json({ ok: false, error: "messageId 필요" }, { status: 400 });
  }

  const sbAny = sb;

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

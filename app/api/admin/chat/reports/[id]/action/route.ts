/**
 * POST /api/admin/chat/reports/:id/action — 신고 처리
 * Body: { action: string, note? }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { id: reportId } = await params;
  let body: { action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const adminId = admin.userId;
  const action = body.action?.trim();
  if (!reportId || !action) {
    return NextResponse.json({ ok: false, error: "reportId, action 필요" }, { status: 400 });
  }

  const sbAny = sb;
  const { data: report } = await sbAny.from("chat_reports").select("id, room_id, message_id").eq("id", reportId).maybeSingle();
  if (!report) {
    return NextResponse.json({ ok: false, error: "신고를 찾을 수 없습니다." }, { status: 404 });
  }

  const now = new Date().toISOString();
  await sbAny.from("chat_reports").update({ status: "actioned", updated_at: now, assigned_admin_id: adminId }).eq("id", reportId);

  const targetType = (report as { message_id: string | null }).message_id ? "message" : "room";
  const targetId = (report as { message_id: string | null }).message_id ?? (report as { room_id: string }).room_id;
  try {
    await sbAny.from("moderation_actions").insert({
      target_type: targetType,
      target_id: targetId,
      action_type: "close_report",
      action_reason: body.note ?? undefined,
      action_note: action,
      actor_admin_id: adminId,
    });
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}

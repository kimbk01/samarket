/**
 * POST /api/admin/chat/reports/:id/action — 신고 처리
 * Body: { action: string, reason } (`note` 호환 별칭)
 * R1-A: 권한 `chats` + 사유 2자 이상 + 상태 CAS(409) + audit_logs (before/after)
 */
import { CHAT_REPORT_OPEN_STATUSES } from "@/lib/admin/metrics/chat-metrics";
import { NextRequest, NextResponse } from "next/server";
import { chatAdminReasonRequired, requireAnyAdminPermission } from "@/lib/admin/chat-admin/chat-admin-guards";
import { TRADE_CHAT_ADMIN_PERMISSION_KEYS } from "@/lib/admin/chat-admin/chat-content-access-policy";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import {
  CHAT_ADMIN_ACTION_REASON_MIN_LENGTH,
  CHAT_ADMIN_AUDIT_REPORT_ACTION,
  isChatAdminReasonValid,
  normalizeChatAdminReason,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAnyAdminPermission(TRADE_CHAT_ADMIN_PERMISSION_KEYS);
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }
  const { id: reportId } = await params;
  let body: { action?: string; note?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const adminId = admin.actor.userId;
  const action = body.action?.trim();
  if (!reportId || !action) {
    return NextResponse.json({ ok: false, error: "reportId, action 필요" }, { status: 400 });
  }
  const reason = normalizeChatAdminReason(body.reason ?? body.note);
  if (!isChatAdminReasonValid(reason, CHAT_ADMIN_ACTION_REASON_MIN_LENGTH)) {
    return chatAdminReasonRequired(CHAT_ADMIN_ACTION_REASON_MIN_LENGTH);
  }

  const sbAny = sb;
  const { data: report } = await sbAny.from("chat_reports").select("id, room_id, message_id, status").eq("id", reportId).maybeSingle();
  if (!report) {
    return NextResponse.json({ ok: false, error: "신고를 찾을 수 없습니다." }, { status: 404 });
  }

  const now = new Date().toISOString();
  // CAS: only the first admin closes the report; a concurrent second action gets 409
  // instead of writing a duplicate moderation_actions row.
  const { data: closed, error: closeErr } = await sbAny
    .from("chat_reports")
    .update({ status: "actioned", updated_at: now, assigned_admin_id: adminId })
    .eq("id", reportId)
    // 처리 대기 상태에서만 종료 (기각된 신고가 actioned 로 뒤집히지 않게).
    .in("status", [...CHAT_REPORT_OPEN_STATUSES.trade_chat])
    .select("id");
  if (closeErr) {
    return NextResponse.json({ ok: false, error: closeErr.message }, { status: 500 });
  }
  if (!closed || closed.length === 0) {
    return NextResponse.json({ ok: false, error: "already_actioned" }, { status: 409 });
  }

  const targetType = (report as { message_id: string | null }).message_id ? "message" : "room";
  const targetId = (report as { message_id: string | null }).message_id ?? (report as { room_id: string }).room_id;
  try {
    await sbAny.from("moderation_actions").insert({
      target_type: targetType,
      target_id: targetId,
      action_type: "close_report",
      action_reason: reason,
      action_note: action,
      actor_admin_id: adminId,
    });
  } catch {
    /* ignore */
  }
  await appendAdminRouteAudit(admin.sb, req, {
    actorId: adminId,
    targetType: "chat_report",
    targetId: reportId,
    action: CHAT_ADMIN_AUDIT_REPORT_ACTION,
    before: { status: (report as { status?: string | null }).status ?? null },
    after: { status: "actioned", action, reason, targetType, targetId, assigned_admin_id: adminId },
  });
  return NextResponse.json({ ok: true });
}

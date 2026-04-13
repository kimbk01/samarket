/**
 * POST /api/chat/reports — 신고 접수 (신고자=세션)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceUserReportQuota } from "@/lib/security/rate-limit-presets";

const REPORT_TYPES = ["room", "message", "user", "item"] as const;
const REASON_TYPES = [
  "abuse", "spam", "scam", "sexual", "hate", "threat", "no_show",
  "impersonation", "off_platform_payment", "stalking", "harassment", "etc",
] as const;

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const reporterUserId = auth.userId;

  const reportRl = await enforceUserReportQuota(reporterUserId, "chat", { limit: 30 });
  if (!reportRl.ok) return reportRl.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  let body: {
    reportType?: string;
    roomId?: string;
    messageId?: string;
    itemId?: string;
    reportedUserId?: string;
    reasonType?: string;
    reasonDetail?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const reportType = body.reportType?.trim();
  const reasonType = body.reasonType?.trim();
  if (!reportType || !REPORT_TYPES.includes(reportType as never)) {
    return NextResponse.json({ ok: false, error: "reportType(room|message|user|item) 필요" }, { status: 400 });
  }
  if (!reasonType || !REASON_TYPES.includes(reasonType as never)) {
    return NextResponse.json({ ok: false, error: "reasonType 필요" }, { status: 400 });
  }
  const sbAny = sb;
  const { data: row, error: insErr } = await sbAny
    .from("chat_reports")
    .insert({
      report_type: reportType,
      room_id: body.roomId?.trim() || null,
      message_id: body.messageId?.trim() || null,
      item_id: body.itemId?.trim() || null,
      reported_user_id: body.reportedUserId?.trim() || null,
      reporter_user_id: reporterUserId,
      reason_type: reasonType,
      reason_detail: typeof body.reasonDetail === "string" ? body.reasonDetail.trim().slice(0, 2000) : null,
      status: "received",
      priority: "medium",
    })
    .select("id")
    .single();

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message ?? "신고 접수 실패" }, { status: 500 });
  }
  if (body.roomId && row?.id) {
    try {
      await sbAny.from("chat_event_logs").insert({
        room_id: body.roomId.trim(),
        event_type: "report_created",
        actor_user_id: reporterUserId,
        metadata: { report_id: (row as { id: string }).id },
      });
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({ ok: true, reportId: (row as { id: string }).id });
}

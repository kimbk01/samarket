import { NextRequest, NextResponse } from "next/server";
import { chatAdminReasonRequired, requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import {
  CHAT_ADMIN_ACTION_REASON_MIN_LENGTH,
  isChatAdminReasonValid,
  normalizeChatAdminReason,
  type CmReportAdminAction,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { runCmReportActionCas } from "@/lib/admin-community-messenger/admin-chat-moderation-cas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `rejected` = 기각 (DB CHECK: received·reviewing·resolved·rejected·sanctioned). */
const REPORT_ACTIONS: readonly CmReportAdminAction[] = [
  "reviewing",
  "resolved",
  "rejected",
  "sanction_message_hide",
  "sanction_room_block",
];

/**
 * POST — 메신저 신고 조치 (R1-A C-5): 권한 `chats` + 사유 2자 이상 + 신고 상태 CAS(409) + audit_logs.
 * Body: { action, reason } (`adminNote` 는 구 클라이언트 호환 별칭)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;

  let body: { action?: string; reason?: string; adminNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { id } = await params;
  const action = String(body.action ?? "") as CmReportAdminAction;
  if (!REPORT_ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  const reason = normalizeChatAdminReason(body.reason ?? body.adminNote);
  if (!isChatAdminReasonValid(reason, CHAT_ADMIN_ACTION_REASON_MIN_LENGTH)) {
    return chatAdminReasonRequired(CHAT_ADMIN_ACTION_REASON_MIN_LENGTH);
  }

  const result = await runCmReportActionCas(admin.sb, req, {
    reportId: String(id ?? "").trim(),
    adminUserId: admin.actor.userId,
    action,
    reason,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

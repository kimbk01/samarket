import { NextRequest, NextResponse } from "next/server";
import { chatAdminReasonRequired, requireChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import {
  CHAT_ADMIN_ACTION_REASON_MIN_LENGTH,
  isChatAdminReasonValid,
  normalizeChatAdminReason,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { runCmMessageHiddenCas } from "@/lib/admin-community-messenger/admin-chat-moderation-cas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH — 메시지 숨김/해제 (R1-A C-5): 권한 `chats` + 사유 2자 이상 + 상태 조건(409) + audit_logs.
 * Body: { hidden: boolean, reason: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const admin = await requireChatAdmin();
  if (!admin.ok) return admin.response;

  let body: { hidden?: boolean; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.hidden !== "boolean") {
    return NextResponse.json({ ok: false, error: "hidden_required" }, { status: 400 });
  }
  const reason = normalizeChatAdminReason(body.reason);
  if (!isChatAdminReasonValid(reason, CHAT_ADMIN_ACTION_REASON_MIN_LENGTH)) {
    return chatAdminReasonRequired(CHAT_ADMIN_ACTION_REASON_MIN_LENGTH);
  }

  const { id, messageId } = await params;
  const result = await runCmMessageHiddenCas(admin.sb, req, {
    roomId: String(id ?? "").trim(),
    messageId: String(messageId ?? "").trim(),
    adminUserId: admin.actor.userId,
    hidden: body.hidden,
    reason,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

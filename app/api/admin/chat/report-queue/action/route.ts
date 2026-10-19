import { NextRequest, NextResponse } from "next/server";
import {
  chatAdminReasonRequired,
  requireAnyAdminPermission,
  requireChatRoomAdminForRow,
} from "@/lib/admin/chat-admin/chat-admin-guards";
import {
  CHAT_ADMIN_ACTION_REASON_MIN_LENGTH,
  CHAT_ADMIN_AUDIT_REPORT_ACTION,
  TRADE_CHAT_ADMIN_PERMISSION_KEYS,
  isChatAdminReasonValid,
  normalizeChatAdminReason,
  type CmReportAdminAction,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { CHAT_REPORT_OPEN_STATUSES } from "@/lib/admin/metrics/chat-metrics";
import { CHAT_REPORT_SOURCES, type ChatReportSource } from "@/lib/admin/chat-admin/admin-chat-report-queue-model";
import { runCmReportActionCas } from "@/lib/admin-community-messenger/admin-chat-moderation-cas";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { safeNotifyChatReportResult } from "@/lib/admin-chat-reports/notify-chat-report-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: readonly CmReportAdminAction[] = [
  "reviewing",
  "resolved",
  "rejected",
  "sanction_message_hide",
  "sanction_room_block",
];

/** 레거시·통합 신고 원천의 상태 전이 (제재는 CM 신고만 — 레거시 방은 조치 불가 409). */
const LEGACY_NEXT: Record<"trade_chat" | "trade_report", Partial<Record<CmReportAdminAction, string>>> = {
  trade_chat: { reviewing: "triaging", resolved: "actioned", rejected: "dismissed" },
  trade_report: { reviewing: "reviewing", resolved: "resolved", rejected: "rejected" },
};
const LEGACY_FROM_RECEIVED: Record<"trade_chat" | "trade_report", string> = {
  trade_chat: "received",
  trade_report: "pending",
};

/**
 * POST /api/admin/chat/report-queue/action — 채팅 신고 처리 단일 서버 액션 (설계 §3-2·시트 S5).
 * Body: { source, id, action, reason }.
 * - messenger: 방 유형 권한(`chats`|거래 `products`|배달 `business`) + 기존 CM 신고 CAS·제재·감사.
 * - trade_chat(`chat_reports`)·trade_report(`reports`): 거래 권한(`chats`|`products`) + 처리 대기 상태에서만 전이(409) + 감사.
 * - 종결 시 신고자·(제재 시) 피신고자에게 결과 알림 (A-7, best-effort).
 *   (예전: 기각이 `reports` 권한 API 를 불러 `chats` 관리자가 403, 레거시 종료가 dismissed→actioned 로 뒤집힘.)
 */
export async function POST(req: NextRequest) {
  let body: { source?: string; id?: string; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const source = String(body.source ?? "") as ChatReportSource;
  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "") as CmReportAdminAction;
  if (!(CHAT_REPORT_SOURCES as readonly string[]).includes(source) || !id) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  const reason = normalizeChatAdminReason(body.reason);
  if (!isChatAdminReasonValid(reason, CHAT_ADMIN_ACTION_REASON_MIN_LENGTH)) {
    return chatAdminReasonRequired(CHAT_ADMIN_ACTION_REASON_MIN_LENGTH);
  }

  if (source === "messenger") {
    const admin = await requireChatRoomAdminForRow("community_messenger_reports", id);
    if (!admin.ok) return admin.response;
    const result = await runCmReportActionCas(admin.sb, req, {
      reportId: id,
      adminUserId: admin.actor.userId,
      action,
      reason,
    });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    await safeNotifyChatReportResult(admin.sb, { source, reportId: id, action });
    return NextResponse.json({ ok: true });
  }

  const admin = await requireAnyAdminPermission(TRADE_CHAT_ADMIN_PERMISSION_KEYS);
  if (!admin.ok) return admin.response;
  const next = LEGACY_NEXT[source][action];
  if (!next) return NextResponse.json({ ok: false, error: "legacy_only_read_only" }, { status: 409 });

  const table = source === "trade_chat" ? "chat_reports" : "reports";
  const { data: before, error: loadErr } = await admin.sb.from(table).select("id, status").eq("id", id).maybeSingle();
  if (loadErr) return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  if (!before) return NextResponse.json({ ok: false, error: "report_not_found" }, { status: 404 });

  const from: string[] =
    action === "reviewing" ? [LEGACY_FROM_RECEIVED[source]] : [...CHAT_REPORT_OPEN_STATUSES[source]];
  const now = new Date().toISOString();
  const patch: Record<string, unknown> =
    source === "trade_chat"
      ? { status: next, updated_at: now, assigned_admin_id: admin.actor.userId }
      : { status: next, admin_note: reason, ...(action === "reviewing" ? {} : { resolved_at: now }) };
  const { data: updated, error: updErr } = await admin.sb
    .from(table)
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id");
  if (updErr) return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ ok: false, error: "stale_state" }, { status: 409 });
  }

  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: source === "trade_chat" ? "chat_report" : "report",
    targetId: id,
    action: CHAT_ADMIN_AUDIT_REPORT_ACTION,
    before: { status: (before as { status?: string | null }).status ?? null },
    after: { status: next, action, reason, source },
  });
  await safeNotifyChatReportResult(admin.sb, { source, reportId: id, action });
  return NextResponse.json({ ok: true });
}

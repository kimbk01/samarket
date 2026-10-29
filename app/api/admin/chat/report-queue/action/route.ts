import { NextRequest, NextResponse } from "next/server";
import { chatAdminReasonRequired, requireChatRoomAdminForRow, requireTradeChatAdmin } from "@/lib/admin/chat-admin/chat-admin-guards";
import {
  CHAT_ADMIN_ACTION_REASON_MIN_LENGTH,
  CHAT_ADMIN_AUDIT_REPORT_ACTION,
  isChatAdminReasonValid,
  normalizeChatAdminReason,
  type CmReportAdminAction,
} from "@/lib/admin/chat-admin/chat-content-access-policy";
import { CHAT_REPORT_OPEN_STATUSES } from "@/lib/admin/metrics/chat-metrics";
import { CHAT_REPORT_SOURCES, type ChatReportSource } from "@/lib/admin/chat-admin/admin-chat-report-queue-model";
import { runCmReportActionCas } from "@/lib/admin-community-messenger/admin-chat-moderation-cas";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { safeNotifyChatReportResult } from "@/lib/admin-chat-reports/notify-chat-report-result";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { tradeAuditMetaArgs } from "@/lib/admin/trade-admin/trade-admin-rpc";
import {
  decideTradeReport,
  notifyAfterTradeReportDecision,
  type TradeReportRpcDecision,
} from "@/lib/admin/trade-admin/trade-report-decision";

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
  trade_report: { reviewing: "reviewing" },
};
const LEGACY_FROM_RECEIVED: Record<"trade_chat" | "trade_report", string> = {
  trade_chat: "received",
  trade_report: "pending",
};

/**
 * RS-01 · E-12 (감사 2026-10-30, K-3) — 거래 신고(`reports`) 종결은 모두 공식 처리 함수 `admin_decide_trade_report` 로 보낸다:
 * 상태값 · 처리 기록(report_actions) · 처리자(resolved_by) · DB 감사가 거래 신고 화면과 같다.
 * - rejected → reject (상태 rejected)
 * - resolved(「처리 완료」, 제재 없음) → resolve (상태 resolved — 거래 신고 화면 「처리 완료」 탭)
 *   ⚠ 배포 의존: DB 함수의 resolve 결정은 마이그레이션 20271031090000_admin_decide_trade_report_resolve_no_action.sql
 *   운영 적용(별도 Owner 승인) 후에만 존재한다. 적용 전에는 DB 가 invalid_action(400)으로 거부하고 상태는 바뀌지 않는다
 *   (대체 경로 없음 — 직접 UPDATE 로 되돌아가지 않는다).
 * - reviewing(검토 시작): 종결이 아니라 함수에 같은 뜻이 없다 → CAS UPDATE 유지.
 */
const CHAT_TRADE_REPORT_RPC_DECISION: Partial<Record<CmReportAdminAction, TradeReportRpcDecision>> = {
  rejected: "reject",
  resolved: "resolve",
};

/**
 * POST /api/admin/chat/report-queue/action — 채팅 신고 처리 단일 서버 액션 (설계 §3-2·시트 S5).
 * Body: { source, id, action, reason }.
 * - messenger: 방 유형 권한(`chats`|거래 `products`|배달 `business`) + 기존 CM 신고 CAS·제재·감사.
 * - trade_chat(`chat_reports`)·trade_report(`reports`): 거래 권한(`chats`|`products`) + 처리 대기 상태에서만 전이(409) + 감사.
 * - trade_report 기각·처리 완료는 거래 신고 공식 처리 함수(`admin_decide_trade_report`, 가드 `requireTradeAdmin`)로 (RS-01·E-12).
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

  // 거래 신고(`reports`) = 거래 신고 처리 경로와 같은 가드(`requireTradeAdmin`, O-2) · 레거시 채팅 신고 = 거래 채팅 가드
  const admin = source === "trade_report" ? await requireTradeAdmin() : await requireTradeChatAdmin();
  if (!admin.ok) return admin.response;

  const rpcDecision = source === "trade_report" ? CHAT_TRADE_REPORT_RPC_DECISION[action] : undefined;
  if (rpcDecision) {
    const meta = tradeAuditMetaArgs(req);
    const res = await decideTradeReport(admin.sb, {
      reportId: id,
      actorId: admin.actor.userId,
      decision: rpcDecision,
      reason,
      hidePost: false,
      restriction: null,
      days: null,
      targetUserId: null,
      ip: meta.p_ip,
      userAgent: meta.p_user_agent,
    });
    if (!res.ok) return res.response;
    await appendAdminRouteAudit(admin.sb, req, {
      actorId: admin.actor.userId,
      targetType: "report",
      targetId: id,
      action: CHAT_ADMIN_AUDIT_REPORT_ACTION,
      before: null,
      after: { status: res.data.status ?? null, action, reason, source, via: "admin_decide_trade_report" },
    });
    // 신고자 결과 알림은 거래 신고 화면과 같은 경로 (같은 신고에 두 번 알리지 않는다)
    await notifyAfterTradeReportDecision(admin.sb, { reportId: id, reason, data: res.data });
    return NextResponse.json({ ok: true });
  }

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
      : // 거래 신고(`reports`) 직접 UPDATE 는 검토 시작(reviewing)만 — 종결은 위 공식 처리 함수 (RS-01·E-12)
        { status: next, admin_note: reason };
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

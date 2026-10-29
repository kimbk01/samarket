import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import { tradeAuditMetaArgs } from "@/lib/admin/trade-admin/trade-admin-rpc";
import { decideTradeReport, mapLegacyReportActionType, notifyAfterTradeReportDecision } from "@/lib/admin/trade-admin/trade-report-decision";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reports/[reportId]/action — 기존 통합 신고 화면 호환 (거래 신고 `reports`).
 * body: { action_type: reject|product_hide|warn|chat_ban, target_user_id?, reason } (구 `action_note` 도 사유로 받는다)
 *
 * 처리는 거래 신고 처리 함수 하나로 (설계 v2 §F-3, 한 트랜잭션): 같은 게시물 대기 신고 함께 종료 ·
 * 게시물 관리자 숨김 · 경고 · 거래 채팅 제한(30일, 실제 차단) · 감사. 계정 정지·차단은 회원 계정 조치에서만.
 * 권한: 활성 관리자 전원 (Owner O-2).
 *
 * G-03 (같은 원장 = 같은 처리 키): 거래 신고 「처리」는 진입점과 무관하게 `requireTradeAdmin` 하나다
 * — 이 라우트(중앙 신고 센터)와 거래 화면 `/api/admin/trade/reports/[id]` POST 가 같은 `decideTradeReport` 를 같은 가드로 부른다.
 * 중앙 목록·상세(`/api/admin/reports`·`[reportId]` GET) 의 `reports` 키는 6개 원장을 합친 「신고 센터」 화면 키이며,
 * `reports` 보유자 ⊆ 거래 Admin(정지 제외 동일 규칙) 이므로 중앙에서 볼 수 있는 사람은 항상 처리할 수 있다.
 * `reports` 키로 좁히면 O-2(거래 전원)와 어긋나고, 거래 화면을 `reports` 로 좁히면 O-2 를 깬다 — 둘 다 택하지 않는다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ reportId: string }> }) {
  const gate = await requireTradeAdmin();
  if (!gate.ok) return gate.response;

  const rid = communityAdminUuidOrNull((await ctx.params).reportId);
  if (!rid) return NextResponse.json({ ok: false, error: "missing_report_id" }, { status: 400 });

  let body: {
    action_type?: string;
    target_user_id?: string | null;
    reason?: string | null;
    action_note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const actionType = String(body.action_type ?? "").trim();
  if (actionType === "account_suspend" || actionType === "account_ban") {
    return NextResponse.json({ ok: false, error: "account_action_in_member_screen" }, { status: 400 });
  }
  const mapped = mapLegacyReportActionType(actionType);
  if (!mapped) return NextResponse.json({ ok: false, error: "invalid_action_type" }, { status: 400 });
  /** R2 — 기각(reject)·제재(sanction) L2 사유: 확인창 사유를 검증해 처리 함수(감사 기록)에 넘긴다. */
  const reason = parseAdminReason(body.reason ?? body.action_note);
  if (!reason) return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });

  const meta = tradeAuditMetaArgs(req);
  const res = await decideTradeReport(gate.sb, {
    reportId: rid,
    actorId: gate.userId,
    decision: mapped.decision,
    reason,
    hidePost: false,
    restriction: mapped.restriction,
    days: mapped.days,
    targetUserId: communityAdminUuidOrNull(body.target_user_id),
    ip: meta.p_ip,
    userAgent: meta.p_user_agent,
  });
  if (!res.ok) return res.response;
  const notified = await notifyAfterTradeReportDecision(gate.sb, { reportId: rid, reason, data: res.data });
  return NextResponse.json({
    ...(notified.notifyWarning ? { sideEffectWarning: true } : {}),
    ok: true,
    status: res.data.status ?? null,
    closedSiblings: res.data.closed_siblings ?? 0,
    warnings: [],
  });
}

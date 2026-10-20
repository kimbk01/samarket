/**
 * 거래 신고 처리 (설계 v2 §C-4 · §F-3). 서버 전용.
 * 처리 1건 = DB 함수 `admin_decide_trade_report` 1번 — 신고 상태 · 같은 게시물 대기 신고 일괄 종료 ·
 * 게시물 관리자 숨김 · 처리 기록 · 경고/거래 활동 제한 · 감사를 한 트랜잭션으로 남긴다.
 * 계정 정지·차단은 회원 계정 조치(같은 거래 회원 화면의 계정 조치)로만 한다.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callTradeAdminRpc, type TradeRpcResult } from "@/lib/admin/trade-admin/trade-admin-rpc";

export const TRADE_REPORT_DECISIONS = ["reject", "hide", "warn", "restrict"] as const;
export type TradeReportDecision = (typeof TRADE_REPORT_DECISIONS)[number];
export const TRADE_RESTRICTION_SCOPES = ["post", "chat", "all"] as const;
export type TradeRestrictionScope = (typeof TRADE_RESTRICTION_SCOPES)[number];
/** 제한 기간 (일). null = 영구 */
export const TRADE_RESTRICTION_DAY_OPTIONS = [1, 3, 7, 30, null] as const;

export function parseTradeRestrictionDays(raw: unknown): number | null | "invalid" {
  if (raw === null || raw === undefined || raw === "" || raw === "permanent") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : "invalid";
}

export async function decideTradeReport(
  sb: SupabaseClient,
  input: {
    reportId: string;
    actorId: string;
    decision: TradeReportDecision;
    reason: string;
    hidePost: boolean;
    restriction: TradeRestrictionScope | null;
    days: number | null;
    targetUserId: string | null;
    ip: string | null;
    userAgent: string | null;
  }
): Promise<TradeRpcResult> {
  return callTradeAdminRpc(sb, "admin_decide_trade_report", {
    p_report_id: input.reportId,
    p_actor_id: input.actorId,
    p_action: input.decision,
    p_reason: input.reason,
    p_hide_post: input.hidePost,
    p_restriction: input.restriction,
    p_days: input.days,
    p_ip: input.ip,
    p_user_agent: input.userAgent,
    p_target_user_id: input.targetUserId,
  });
}

/** 기존 통합 신고 화면의 action_type → 거래 신고 처리 */
export function mapLegacyReportActionType(
  actionType: string
): { decision: TradeReportDecision; restriction: TradeRestrictionScope | null; days: number | null } | null {
  switch (actionType) {
    case "reject":
      return { decision: "reject", restriction: null, days: null };
    case "product_hide":
      return { decision: "hide", restriction: null, days: null };
    case "warn":
      return { decision: "warn", restriction: null, days: null };
    case "chat_ban":
      // 예전 「채팅 금지(30일)」 — 기록만 남고 막지 못하던 것을 실제로 막는 거래 채팅 제한으로
      return { decision: "restrict", restriction: "chat", days: 30 };
    default:
      return null;
  }
}

/**
 * 처리 후 알림 (커밋 뒤). 신고자 = 처리 완료만, 대상 회원 = 경고·제한, 판매자 = 거래글 숨김.
 * 실패해도 처리 결과는 그대로이며 화면에 알림 실패만 표시한다.
 */
export async function notifyAfterTradeReportDecision(
  sb: SupabaseClient,
  input: { reportId: string; reason: string; data: Record<string, unknown> }
): Promise<{ notifyWarning: boolean }> {
  try {
    const { notifyTradePostModerated, notifyTradeReportProcessed, notifyTradeSanction } = await import(
      "@/lib/notifications/notify-trade-moderation"
    );
    const { data: rep } = await sb
      .from("reports")
      .select("reporter_id, product_id, target_id, target_type")
      .eq("id", input.reportId)
      .maybeSingle();
    const r = (rep ?? {}) as Record<string, unknown>;
    await notifyTradeReportProcessed(sb, { reporterId: r.reporter_id as string | null, reportId: input.reportId });

    const targetUser = typeof input.data.target_user_id === "string" ? input.data.target_user_id : null;
    if (input.data.post_hidden === true) {
      const postId = String(r.product_id ?? r.target_id ?? "");
      if (postId && targetUser) {
        await notifyTradePostModerated(sb, {
          userId: targetUser,
          postId,
          kind: "hidden",
          reason: input.reason,
          dedupeId: `report:${input.reportId}`,
        });
      }
    }
    const sanction = input.data.sanction as Record<string, unknown> | null | undefined;
    if (sanction && sanction.ok === true && sanction.duplicate !== true && targetUser) {
      const { data: s } = await sb
        .from("sanctions")
        .select("id, sanction_type, restriction, end_at")
        .eq("id", String(sanction.id))
        .maybeSingle();
      const row = (s ?? {}) as Record<string, unknown>;
      await notifyTradeSanction(sb, {
        userId: targetUser,
        sanctionId: String(sanction.id),
        kind: row.sanction_type === "warning" ? "warning" : "restriction",
        restriction: (row.restriction as "post" | "chat" | "all" | null) ?? null,
        endAt: (row.end_at as string | null) ?? null,
        reason: input.reason,
      });
    }
    return { notifyWarning: false };
  } catch (e) {
    console.error("[trade-report-decision] notify", e instanceof Error ? e.message : e);
    return { notifyWarning: true };
  }
}

/**
 * 거래 홍보(더 알리기) 관리자 조치 (설계 v2 §G-0 · §G-1). 서버 전용.
 * 조치 1건 = DB 함수 1번 = 트랜잭션 1개 (상태 · 보류/확정/해제 · 원장 · 환급 · 감사).
 * 이 파일 밖에서 거래 홍보 주문 상태나 포인트를 직접 바꾸지 않는다.
 * 알림은 커밋 뒤 (실패해도 조치 유지).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tradeRpcErrorStatus } from "@/lib/admin/trade-admin/trade-admin-rpc";

export const TRADE_PROMOTION_ACTIONS = ["approve", "reject", "pause", "resume", "end"] as const;
export type TradePromotionAction = (typeof TRADE_PROMOTION_ACTIONS)[number];

export type TradePromotionActionResult =
  | { ok: true; data: Record<string, unknown>; notifyWarning?: boolean }
  | { ok: false; error: string; httpStatus: number };

export async function runTradePromotionAction(
  sb: SupabaseClient,
  input: {
    orderId: string;
    actorId: string;
    action: TradePromotionAction;
    reason: string | null;
    /** end 전용 — operator(운영 귀책 → 남은 기간 비례 환급) | member | none */
    fault?: "operator" | "member" | "none" | null;
    reasonCode?: string | null;
    /** end 전용 — 환급 금액 미리보기 (아무것도 바꾸지 않음) */
    preview?: boolean;
    ip?: string | null;
    userAgent?: string | null;
  }
): Promise<TradePromotionActionResult> {
  const meta = { p_ip: input.ip ?? null, p_user_agent: input.userAgent ?? null };
  let fn: string;
  let args: Record<string, unknown>;
  switch (input.action) {
    case "approve":
      fn = "admin_trade_promotion_approve";
      args = { p_order_id: input.orderId, p_actor_id: input.actorId, p_reason: input.reason, ...meta };
      break;
    case "reject":
    case "pause":
    case "resume":
      fn = `admin_trade_promotion_${input.action}`;
      args = { p_order_id: input.orderId, p_actor_id: input.actorId, p_reason: input.reason ?? "", ...meta };
      break;
    case "end":
      fn = "admin_trade_promotion_end";
      args = {
        p_order_id: input.orderId,
        p_actor_id: input.actorId,
        p_reason_code: input.reasonCode ?? "admin_end",
        p_fault: input.fault ?? "",
        p_reason: input.reason ?? "",
        p_preview: input.preview === true,
        ...meta,
      };
      break;
    default:
      return { ok: false, error: "invalid_action", httpStatus: 400 };
  }

  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    console.error(`[trade-promotion] ${fn}`, error.message);
    return { ok: false, error: "server_error", httpStatus: 500 };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    const code = String(r.error ?? "failed");
    return { ok: false, error: code, httpStatus: tradeRpcErrorStatus(code) };
  }
  if (input.preview) return { ok: true, data: r };

  let notifyWarning = false;
  if (input.action === "approve" || input.action === "reject" || input.action === "end") {
    try {
      const { notifyTradePromotionDecision } = await import("@/lib/notifications/notify-trade-moderation");
      const { data: order } = await sb
        .from("point_promotion_orders")
        .select("user_id")
        .eq("id", input.orderId)
        .maybeSingle();
      await notifyTradePromotionDecision(sb, {
        userId: (order as { user_id?: string } | null)?.user_id ?? null,
        orderId: input.orderId,
        kind: input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "ended",
        points: Number(input.action === "reject" ? r.released_points : r.refund_points) || 0,
        reason: input.reason,
      });
    } catch (e) {
      notifyWarning = true;
      console.error("[trade-promotion] notify", e instanceof Error ? e.message : e);
    }
  }
  return { ok: true, data: r, ...(notifyWarning ? { notifyWarning } : {}) };
}

/**
 * 커뮤니티 홍보 주문 — 관리자 중지·재개·종료(환급) 서버 공용 (설계 §F-1-2 · M9 RPC).
 * 계산·원장 기록·주문 갱신은 DB RPC 1회(주문 FOR UPDATE + 환급 원장 unique). TS 는 결과만 전달한다.
 * 서버 전용 — 클라이언트에서 import 금지.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CommunityPromotionFault = "operator" | "member";

export function parseCommunityPromotionFault(raw: unknown): CommunityPromotionFault | null {
  return raw === "operator" || raw === "member" ? raw : null;
}

export type RunningCommunityPromotion = {
  id: string;
  userId: string;
  orderStatus: "active" | "paused";
  endAt: string | null;
};

/** 게시글에 걸린 노출 중·중지 커뮤니티 홍보 주문 */
export async function listRunningCommunityPromotionsForPost(
  sb: SupabaseClient,
  postId: string
): Promise<RunningCommunityPromotion[]> {
  const { data, error } = await sb
    .from("point_promotion_orders")
    .select("id, user_id, order_status, end_at")
    .eq("domain", "community")
    .eq("target_id", postId)
    .in("order_status", ["active", "paused"]);
  if (error || !Array.isArray(data)) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id ?? ""),
    userId: String(r.user_id ?? ""),
    orderStatus: r.order_status === "paused" ? "paused" : "active",
    endAt: r.end_at != null ? String(r.end_at) : null,
  }));
}

export type PromotionEndRpcResult =
  | {
      ok: true;
      preview: boolean;
      refundPoints: number;
      refundLedgerId: string | null;
      paidPoints: number | null;
      remainingSeconds: number | null;
      hasPaymentRecord: boolean;
    }
  | { ok: false; error: string; httpStatus: number };

const PROMOTION_RPC_ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  not_active: 409,
  not_paused: 409,
  not_running: 409,
  fault_required: 400,
  reason_required: 400,
  forbidden: 500,
};

export function promotionRpcErrorStatus(code: string): number {
  return PROMOTION_RPC_ERROR_STATUS[code] ?? 400;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** admin_promotion_end RPC 래퍼 — preview=true 는 계산만 한다. */
export async function callAdminPromotionEnd(
  sb: SupabaseClient,
  input: {
    orderId: string;
    actorId: string;
    reasonCode: string;
    fault: "operator" | "member" | "none";
    reason: string;
    preview?: boolean;
  }
): Promise<PromotionEndRpcResult> {
  const { data, error } = await sb.rpc("admin_promotion_end", {
    p_order_id: input.orderId,
    p_actor_id: input.actorId,
    p_reason_code: input.reasonCode.slice(0, 64),
    p_fault: input.fault,
    p_reason: input.reason,
    p_preview: input.preview === true,
  });
  if (error) return { ok: false, error: error.message, httpStatus: 500 };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    const code = String(row.error ?? "rpc_failed");
    return { ok: false, error: code, httpStatus: promotionRpcErrorStatus(code) };
  }
  return {
    ok: true,
    preview: row.preview === true,
    refundPoints: Math.max(0, Math.floor(num(row.refund_points) ?? 0)),
    refundLedgerId: row.refund_ledger_id != null ? String(row.refund_ledger_id) : null,
    paidPoints: num(row.paid_points),
    remainingSeconds: num(row.remaining_seconds),
    hasPaymentRecord: row.has_payment_record === true,
  };
}

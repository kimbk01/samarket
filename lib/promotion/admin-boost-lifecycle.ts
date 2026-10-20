/**
 * Admin Boost lifecycle after CAPTURE (Trade + Community Point promote).
 * pause/resume/end.
 * - trade: 거래 홍보 DB 함수 (거래 Admin 설계 v2 §G-0) — 재개 시 종료일 연장, 종료는 귀책 기준 비례 환급, 감사 포함.
 * - community: DB RPC (M9 `admin_promotion_pause|resume|end`) — 재개 시 중지 시간만큼 종료일 연장,
 *   종료는 귀책(fault) 필수 · 운영 귀책이면 남은 노출 비례 원장 환급 (설계 §F-1-2).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  callAdminPromotionEnd,
  promotionRpcErrorStatus,
} from "@/lib/admin/community-admin/community-promotion-admin";

export type BoostLifecycleAction = "pause" | "resume" | "end";

export type BoostLifecycleResult =
  | {
      ok: true;
      orderId: string;
      orderStatus: string;
      endAt: string | null;
      /** community only */
      buyerUserId?: string | null;
      refundPoints?: number;
      refundLedgerId?: string | null;
      extendedSeconds?: number;
      /** community end preview only (nothing changed) */
      preview?: {
        refundPoints: number;
        paidPoints: number | null;
        remainingSeconds: number | null;
        hasPaymentRecord: boolean;
      };
    }
  | { ok: false; error: string; httpStatus: number };

export async function applyBoostLifecycle(
  sb: SupabaseClient,
  input: {
    orderId: string;
    domain: "trade" | "community";
    action: BoostLifecycleAction;
    adminUserId: string;
    reason?: string | null;
    /** end — 'operator' | 'member' (거래는 'none' 도 허용) */
    fault?: "operator" | "member" | "none" | null;
    /** community end only — end_reason_code (default admin_end) */
    reasonCode?: string | null;
    /** community end only — compute refund without changing anything */
    preview?: boolean;
  }
): Promise<BoostLifecycleResult> {
  const orderId = input.orderId.trim();
  if (!orderId) return { ok: false, error: "missing_order", httpStatus: 400 };

  const { data: row, error } = await sb
    .from("point_promotion_orders")
    .select("id, domain, order_status, end_at, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !row?.id) {
    return { ok: false, error: "not_found", httpStatus: 404 };
  }

  const domain = String((row as { domain?: string }).domain ?? "");
  if (domain !== input.domain) {
    return { ok: false, error: "domain_mismatch", httpStatus: 409 };
  }

  const status = String((row as { order_status?: string }).order_status ?? "").toLowerCase();
  const now = new Date().toISOString();
  if (input.domain === "community") {
    return applyCommunityBoostLifecycleRpc(sb, {
      ...input,
      orderId,
      buyerUserId: String((row as { user_id?: string | null }).user_id ?? "") || null,
    });
  }
  void status;
  void now;
  // 거래: DB 함수 (설계 v2 §G-0) — 상태·환급·감사 한 트랜잭션. 사유 필수, 종료는 귀책 필수.
  const { runTradePromotionAction } = await import("@/lib/admin/trade-admin/trade-promotion-admin");
  const res = await runTradePromotionAction(sb, {
    orderId,
    actorId: input.adminUserId,
    action: input.action,
    reason: input.reason ?? null,
    fault: input.fault ?? null,
    reasonCode: input.reasonCode ?? null,
    preview: input.preview === true,
  });
  if (!res.ok) return { ok: false, error: res.error, httpStatus: res.httpStatus };
  const d = res.data;
  return {
    ok: true,
    orderId,
    orderStatus: String(d.order_status ?? ""),
    endAt: d.end_at != null ? String(d.end_at) : null,
    buyerUserId: String((row as { user_id?: string | null }).user_id ?? "") || null,
    refundPoints: Number(d.refund_points ?? 0) || 0,
    refundLedgerId: d.refund_ledger_id != null ? String(d.refund_ledger_id) : null,
    extendedSeconds: Number(d.extended_seconds ?? 0) || 0,
    ...(d.preview === true
      ? {
          preview: {
            refundPoints: Number(d.refund_points ?? 0) || 0,
            paidPoints: d.paid_points != null ? Number(d.paid_points) : null,
            remainingSeconds: d.remaining_seconds != null ? Number(d.remaining_seconds) : null,
            hasPaymentRecord: d.has_payment_record === true,
          },
        }
      : {}),
  };
}

async function applyCommunityBoostLifecycleRpc(
  sb: SupabaseClient,
  input: {
    orderId: string;
    action: BoostLifecycleAction;
    adminUserId: string;
    reason?: string | null;
    fault?: "operator" | "member" | "none" | null;
    reasonCode?: string | null;
    preview?: boolean;
    buyerUserId: string | null;
  }
): Promise<BoostLifecycleResult> {
  if (input.action === "pause" || input.action === "resume") {
    const fn = input.action === "pause" ? "admin_promotion_pause" : "admin_promotion_resume";
    const { data, error } = await sb.rpc(fn, { p_order_id: input.orderId, p_actor_id: input.adminUserId });
    if (error) return { ok: false, error: error.message, httpStatus: 500 };
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.ok !== true) {
      const code = String(r.error ?? "rpc_failed");
      return { ok: false, error: code, httpStatus: promotionRpcErrorStatus(code) };
    }
    return {
      ok: true,
      orderId: input.orderId,
      orderStatus: String(r.order_status ?? (input.action === "pause" ? "paused" : "active")),
      endAt: r.end_at != null ? String(r.end_at) : null,
      buyerUserId: input.buyerUserId,
      ...(input.action === "resume" ? { extendedSeconds: Number(r.extended_seconds ?? 0) || 0 } : {}),
    };
  }

  if (input.fault !== "operator" && input.fault !== "member") {
    return { ok: false, error: "fault_required", httpStatus: 400 };
  }
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 2) return { ok: false, error: "reason_required", httpStatus: 400 };
  const res = await callAdminPromotionEnd(sb, {
    orderId: input.orderId,
    actorId: input.adminUserId,
    reasonCode: String(input.reasonCode ?? "").trim() || "admin_end",
    fault: input.fault,
    reason,
    preview: input.preview === true,
  });
  if (!res.ok) return res;
  if (res.preview) {
    return {
      ok: true,
      orderId: input.orderId,
      orderStatus: "preview",
      endAt: null,
      buyerUserId: input.buyerUserId,
      preview: {
        refundPoints: res.refundPoints,
        paidPoints: res.paidPoints,
        remainingSeconds: res.remainingSeconds,
        hasPaymentRecord: res.hasPaymentRecord,
      },
    };
  }
  return {
    ok: true,
    orderId: input.orderId,
    orderStatus: "ended",
    endAt: new Date().toISOString(),
    buyerUserId: input.buyerUserId,
    refundPoints: res.refundPoints,
    refundLedgerId: res.refundLedgerId,
  };
}

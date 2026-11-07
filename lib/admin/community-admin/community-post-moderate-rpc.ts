/**
 * D-11 ① (2026-11-07) — 진행 중 상위노출이 걸린 커뮤니티 글 관리자 숨김·삭제 = DB 함수 1번.
 * `admin_community_post_moderate(p_post, p_admin, p_action hide|delete, p_fault operator|member|null, p_reason, p_expected_updated_at)`
 * → jsonb { ok, ended_orders:[{order_id,user_id,refund_points,refund_ledger_id,before}], refund_points, before_status,
 *           post:{id,status,updated_at,moderated_at} } — 주문 종료(admin_promotion_end)·글 상태 변경·CAS 를 한 트랜잭션에서 한다.
 * 오류: invalid_action · reason_required · not_found · conflict · no_change · promotion_fault_required(+promotions) ·
 *       promotion_end_failed(+order_id, end_error). 함수는 상태 변경만 — 글/주문 감사·알림·포인트 회수는 커밋 뒤 웹이 한다.
 * 함수가 없으면 아무것도 바꾸지 않고 `rpc_missing`(503) 을 돌려준다(주문만 끝나는 2단계 폴백 없음).
 * DB 원문 오류는 내보내지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import type { RunningCommunityPromotion } from "@/lib/admin/community-admin/community-promotion-admin";
import { notifyCommunityPromotionEnded } from "@/lib/notifications/notify-community-moderation";

export const ADMIN_COMMUNITY_POST_MODERATE_RPC = "admin_community_post_moderate" as const;

export type CommunityPostModerateEndedOrder = {
  orderId: string;
  userId: string | null;
  refundPoints: number;
  refundLedgerId: string | null;
  before: Record<string, unknown> | null;
};

export type CommunityPostModerateResult =
  | {
      ok: true;
      endedOrders: CommunityPostModerateEndedOrder[];
      refundPoints: number;
      beforeStatus: string | null;
      post: { id: string; status: string | null; updated_at: string | null; moderated_at: string | null } | null;
    }
  | { ok: false; error: string; httpStatus: number; detail?: Record<string, unknown> };

const ERROR_STATUS: Record<string, number> = {
  not_found: 404,
  fault_required: 400,
  promotion_fault_required: 400,
  reason_required: 400,
  invalid_action: 400,
  forbidden: 403,
  not_admin: 403,
  conflict: 409,
  no_change: 400,
  promotion_end_failed: 409,
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** `ended_orders` — 배열({order_id|id, user_id, refund_points}) 또는 개수. 배열이 아니면 빈 목록. */
export function parseEndedOrders(raw: unknown): CommunityPostModerateEndedOrder[] {
  if (!Array.isArray(raw)) return [];
  const out: CommunityPostModerateEndedOrder[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ orderId: item, userId: null, refundPoints: 0, refundLedgerId: null, before: null });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const orderId = String(r.order_id ?? r.id ?? "").trim();
    if (!orderId) continue;
    out.push({
      orderId,
      userId: r.user_id != null ? String(r.user_id) : null,
      refundPoints: num(r.refund_points),
      refundLedgerId: r.refund_ledger_id != null ? String(r.refund_ledger_id) : null,
      before: r.before && typeof r.before === "object" ? (r.before as Record<string, unknown>) : null,
    });
  }
  return out;
}

export async function moderateCommunityPostWithPromotions(
  sb: SupabaseClient,
  input: {
    postId: string;
    actorId: string;
    action: "hide" | "delete";
    fault: "operator" | "member" | null;
    reason: string;
    /** 화면이 읽은 글 버전 — 함수가 같은 트랜잭션에서 CAS 한다(다르면 conflict). */
    expectedUpdatedAt?: string | null;
  }
): Promise<CommunityPostModerateResult> {
  const { data, error } = await sb.rpc(ADMIN_COMMUNITY_POST_MODERATE_RPC, {
    p_post: input.postId,
    p_admin: input.actorId,
    p_action: input.action,
    p_fault: input.fault,
    p_reason: input.reason,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  });
  if (error) {
    const msg = String(error.message ?? "");
    const missing =
      error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(msg);
    return missing
      ? { ok: false, error: "rpc_missing", httpStatus: 503 }
      : { ok: false, error: "moderate_failed", httpStatus: 500 };
  }
  const payload = (data ?? null) as Record<string, unknown> | null;
  if (!payload || payload.ok !== true) {
    const code = String(payload?.error ?? "moderate_failed");
    const known = code in ERROR_STATUS;
    const detail: Record<string, unknown> = {};
    if (code === "promotion_fault_required" && Array.isArray(payload?.promotions)) detail.promotions = payload!.promotions;
    if (code === "promotion_end_failed") {
      if (payload?.order_id != null) detail.orderId = String(payload.order_id);
      if (typeof payload?.end_error === "string") detail.endError = payload.end_error;
    }
    return {
      ok: false,
      error: known ? code : "moderate_failed",
      httpStatus: known ? ERROR_STATUS[code]! : 500,
      ...(Object.keys(detail).length ? { detail } : {}),
    };
  }
  const postRaw = payload.post && typeof payload.post === "object" ? (payload.post as Record<string, unknown>) : null;
  return {
    ok: true,
    endedOrders: parseEndedOrders(payload.ended_orders),
    refundPoints: num(payload.refund_points),
    beforeStatus: payload.before_status != null ? String(payload.before_status) : null,
    post: postRaw
      ? {
          id: String(postRaw.id ?? ""),
          status: postRaw.status != null ? String(postRaw.status) : null,
          updated_at: postRaw.updated_at != null ? String(postRaw.updated_at) : null,
          moderated_at: postRaw.moderated_at != null ? String(postRaw.moderated_at) : null,
        }
      : null,
  };
}

/**
 * DB 함수 성공 뒤 — 끝난 주문마다 주문 감사 1행 + 구매자 알림 (예전 `runCommunityPromotionOrderAction` 종료와 같은 기록).
 * 주문별 환급은 함수가 돌려준 `ended_orders` 값을 쓰고, 없으면(주문 1건) 합계를 쓴다.
 */
export async function recordModeratedPromotionEnds(
  sb: SupabaseClient,
  req: Request | null,
  input: {
    actorId: string;
    promotions: RunningCommunityPromotion[];
    moderated: { endedOrders: CommunityPostModerateEndedOrder[]; refundPoints: number };
    fault: "operator" | "member" | null;
    reason: string | null;
    endReasonCode: string;
  }
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const p of input.promotions) {
    const ended = input.moderated.endedOrders.find((o) => o.orderId === p.id);
    const refundPoints =
      ended?.refundPoints ?? (input.promotions.length === 1 ? input.moderated.refundPoints : 0);
    out.push({ orderId: p.id, ok: true, refundPoints, refundLedgerId: ended?.refundLedgerId ?? null });
    await appendCommunityAdminAudit(sb, req, {
      actorId: input.actorId,
      targetType: "community_promotion_order",
      targetId: p.id,
      action: "community_promotion_order.end",
      reason: input.reason,
      before: ended?.before ?? { id: p.id, order_status: p.orderStatus, end_at: p.endAt },
      after: {
        order_status: "ended",
        action: "end",
        fault: input.fault,
        refund_points: refundPoints,
        refund_ledger_id: ended?.refundLedgerId ?? null,
        end_reason_code: input.endReasonCode,
        via: ADMIN_COMMUNITY_POST_MODERATE_RPC,
      },
    });
    try {
      await notifyCommunityPromotionEnded(sb, {
        userId: ended?.userId ?? p.userId,
        orderId: p.id,
        refundPoints,
        reason: input.reason,
      });
    } catch (e) {
      console.error("[community-post-moderate] promotion end notify", e);
    }
  }
  return out;
}

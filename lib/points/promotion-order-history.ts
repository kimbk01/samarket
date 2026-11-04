/**
 * 회원 상위노출 신청 내역 — 서버 쪽 이동(offset·limit·total) + 기간 합계 (C-5 · Owner 2026-11-03
 * 「페이지 이동·날짜 명확 · 계산된 내용이 나오는 구조」).
 *
 * - 기간 = 신청일(`created_at`) 기준, PHT 날짜 → UTC `[fromIso, toIso)` (`resolvePointHistoryPeriod` 와 같은 규칙).
 * - 합계는 기간 **전체**를 DB 집계(`member_promotion_order_period_sums` · P-9)로 계산 (현재 쪽 합계 아님 · 일부만 합산 없음).
 * - 순수 함수(`promotionOrderSummaryFromGroups`·`parsePromotionOrderPageParams`)는 화면·API 공용.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import type { PointPromotionOrder } from "@/lib/types/point";

/** 한 쪽 크기 — 포인트 내역(`ME_POINTS_PAGE_SIZE`)과 같은 20 */
export const PROMOTION_ORDERS_PAGE_SIZE = 20;
export const PROMOTION_ORDERS_MAX_LIMIT = 100;

/** 상태 표시 순서 — 모르는 상태는 뒤에 원래 이름 그대로 */
export const PROMOTION_ORDER_STATUS_ORDER = [
  "pending",
  "pending_review",
  "active",
  "paused",
  "expired",
  "ended",
  "rejected",
  "cancelled",
] as const;

export type PromotionOrderStatusTotal = { status: string; count: number; pointCost: number };

export type PromotionOrderPeriodSummary = {
  /** 기간 안 신청 건수 */
  count: number;
  /** 기간 안 신청 포인트 합계 (결제 금액 `point_cost`) */
  pointCost: number;
  /** 그중 환불된 포인트 합계 (`refund_points`) */
  refundPoints: number;
  /** 상태별 건수·포인트 (0건 상태는 없음) */
  byStatus: PromotionOrderStatusTotal[];
};


function int(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
}

export const MEMBER_PROMOTION_ORDER_PERIOD_SUMS_RPC = "member_promotion_order_period_sums" as const;

/**
 * DB 상태별 묶음 → 기간 합계 (상태 정리·음수 0 은 SQL 이 줄마다 함) —
 * 상태 표시 순서는 PROMOTION_ORDER_STATUS_ORDER. 전량 합산이라 「일부만 합산」 없음.
 */
export function promotionOrderSummaryFromGroups(raw: unknown): PromotionOrderPeriodSummary {
  const groups = (Array.isArray(raw) ? raw : []) as Array<{
    status?: string;
    count?: number | string;
    point_cost?: number | string;
    refund_points?: number | string;
  }>;
  const order = PROMOTION_ORDER_STATUS_ORDER as readonly string[];
  const rank = (st: string) => {
    const i = order.indexOf(st);
    return i < 0 ? order.length : i;
  };
  let count = 0;
  let pointCost = 0;
  let refundPoints = 0;
  const byStatus: PromotionOrderStatusTotal[] = [];
  for (const g of groups) {
    const n = Math.max(0, int(g.count));
    const cost = Math.max(0, int(g.point_cost));
    count += n;
    pointCost += cost;
    refundPoints += Math.max(0, int(g.refund_points));
    if (n > 0) byStatus.push({ status: String(g.status ?? "unknown"), count: n, pointCost: cost });
  }
  byStatus.sort((a, b) => rank(a.status) - rank(b.status) || a.status.localeCompare(b.status));
  return { count, pointCost, refundPoints, byStatus };
}

/**
 * 쪽 이동 요청인가 — `offset` 을 보내면 쪽 모드(목록 잘림 없음 · total 포함).
 * 보내지 않으면 null (예전 호출처: 광고 시트·내 상품 등 최근 50건 그대로).
 */
export function parsePromotionOrderPageParams(
  sp: Pick<URLSearchParams, "get">
): { offset: number; limit: number } | null {
  const raw = sp.get("offset");
  if (raw == null || raw.trim() === "") return null;
  const offset = Math.max(0, Math.trunc(Number(raw)) || 0);
  const limitRaw = Math.trunc(Number(sp.get("limit") ?? PROMOTION_ORDERS_PAGE_SIZE));
  const limit = Math.min(
    PROMOTION_ORDERS_MAX_LIMIT,
    Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : PROMOTION_ORDERS_PAGE_SIZE)
  );
  return { offset, limit };
}

export type PromotionOrdersPage = {
  orders: PointPromotionOrder[];
  total: number;
  offset: number;
  limit: number;
  periodSummary: PromotionOrderPeriodSummary | null;
};

/** 서버 — 기간 안 신청 한 쪽 + 전체 건수 + (선택) 기간 합계 */
export async function loadPromotionOrdersPage(
  sb: SupabaseClient,
  input: {
    userId: string;
    fromIso: string | null;
    toIso: string | null;
    offset: number;
    limit: number;
    withSummary: boolean;
  }
): Promise<{ ok: true; page: PromotionOrdersPage } | { ok: false; error: string }> {
  let pageQ = sb
    .from("point_promotion_orders")
    .select("*", { count: "exact" })
    .eq("user_id", input.userId);
  if (input.fromIso) pageQ = pageQ.gte("created_at", input.fromIso);
  if (input.toIso) pageQ = pageQ.lt("created_at", input.toIso);
  const pagePromise = pageQ
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);

  // 기간 합계 = DB 집계 1회 (재감사 P-9 · `member_promotion_order_period_sums`) — 이전: 최대 5천 줄 읽어 합산
  const sumPromise = input.withSummary
    ? sb.rpc(MEMBER_PROMOTION_ORDER_PERIOD_SUMS_RPC, {
        p_user_id: input.userId,
        p_from: input.fromIso,
        p_to: input.toIso,
      })
    : null;
  const [pageRes, sumRes] = await Promise.all([pagePromise, sumPromise]);
  if (pageRes.error) return { ok: false, error: pageRes.error.message };
  if (sumRes?.error) return { ok: false, error: sumRes.error.message };
  const orders = (pageRes.data ?? []).map((r) => mapPointPromotionOrderRow(r as Record<string, unknown>));
  return {
    ok: true,
    page: {
      orders,
      total: pageRes.count ?? orders.length,
      offset: input.offset,
      limit: input.limit,
      periodSummary: sumRes ? promotionOrderSummaryFromGroups(sumRes.data) : null,
    },
  };
}

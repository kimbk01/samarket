/**
 * 회원 상위노출 신청 내역 — 서버 쪽 이동(offset·limit·total) + 기간 합계 (C-5 · Owner 2026-11-03
 * 「페이지 이동·날짜 명확 · 계산된 내용이 나오는 구조」).
 *
 * - 기간 = 신청일(`created_at`) 기준, PHT 날짜 → UTC `[fromIso, toIso)` (`resolvePointHistoryPeriod` 와 같은 규칙).
 * - 합계는 기간 **전체** 행으로 계산 (현재 쪽 합계 아님). 행이 `PROMOTION_ORDER_SUMMARY_CAP` 를 넘으면 `capped`.
 * - 순수 함수(`summarizePromotionOrders`·`parsePromotionOrderPageParams`)는 화면·API 공용.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPointPromotionOrderRow } from "@/lib/points/point-promotion-orders-db";
import type { PointPromotionOrder } from "@/lib/types/point";

/** 한 쪽 크기 — 포인트 내역(`ME_POINTS_PAGE_SIZE`)과 같은 20 */
export const PROMOTION_ORDERS_PAGE_SIZE = 20;
export const PROMOTION_ORDERS_MAX_LIMIT = 100;
/** 기간 합계 계산에 읽는 최대 행 수 */
export const PROMOTION_ORDER_SUMMARY_CAP = 5000;

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
  rowCount: number;
  capped: boolean;
  cap: number;
};

export type PromotionOrderSummaryRow = {
  order_status?: string | null;
  point_cost?: number | string | null;
  refund_points?: number | string | null;
};

function int(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
}

export function summarizePromotionOrders(
  rows: readonly PromotionOrderSummaryRow[],
  opts?: { rowCount?: number; cap?: number }
): PromotionOrderPeriodSummary {
  const cap = opts?.cap ?? PROMOTION_ORDER_SUMMARY_CAP;
  const byStatus = new Map<string, PromotionOrderStatusTotal>();
  let pointCost = 0;
  let refundPoints = 0;
  for (const r of rows) {
    const status = String(r.order_status ?? "").trim().toLowerCase() || "unknown";
    const cost = Math.max(0, int(r.point_cost));
    pointCost += cost;
    refundPoints += Math.max(0, int(r.refund_points));
    const cur = byStatus.get(status) ?? { status, count: 0, pointCost: 0 };
    cur.count += 1;
    cur.pointCost += cost;
    byStatus.set(status, cur);
  }
  const order = PROMOTION_ORDER_STATUS_ORDER as readonly string[];
  const rank = (s: string) => {
    const i = order.indexOf(s);
    return i < 0 ? order.length : i;
  };
  const rowCount = Math.max(rows.length, opts?.rowCount ?? rows.length);
  return {
    count: rows.length,
    pointCost,
    refundPoints,
    byStatus: [...byStatus.values()].sort((a, b) => rank(a.status) - rank(b.status) || a.status.localeCompare(b.status)),
    rowCount,
    capped: rowCount > rows.length,
    cap,
  };
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

  let sumQ = sb
    .from("point_promotion_orders")
    .select("order_status, point_cost, refund_points", { count: "exact" })
    .eq("user_id", input.userId);
  if (input.fromIso) sumQ = sumQ.gte("created_at", input.fromIso);
  if (input.toIso) sumQ = sumQ.lt("created_at", input.toIso);
  const sumPromise = input.withSummary
    ? sumQ.order("created_at", { ascending: false }).limit(PROMOTION_ORDER_SUMMARY_CAP)
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
      periodSummary: sumRes
        ? summarizePromotionOrders((sumRes.data ?? []) as PromotionOrderSummaryRow[], {
            rowCount: sumRes.count ?? undefined,
          })
        : null,
    },
  };
}

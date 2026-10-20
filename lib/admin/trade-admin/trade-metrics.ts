/**
 * 거래 대시보드 집계 SSOT (설계 v2 §E). 서버 전용.
 * - 처리 대기(기간 무관) · 현재 상태 · 기간 통계(Asia/Manila [from, to)) 를 서로 다른 영역으로 돌려준다.
 * - 게시물 건수는 목록과 같은 조건 함수(`countTradePosts`)를 쓴다 → 지표 = 목록 total.
 * - 조회 실패는 null (화면 「확인 불가」, 0 과 구분) + errors 배열.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countTradePosts,
  loadTradePostsContext,
  parseTradePostsFilter,
  resolveTradePostLguIds,
} from "@/lib/admin/trade-admin/trade-posts-query";
import { applyTradeReportTabFilter } from "@/lib/admin/metrics/admin-metric-filters";
import { TRADE_POST_TABS, type TradePostTab } from "@/lib/admin/trade-admin/trade-post-tabs";
import { SUPPORT_TRADE_CATEGORY, SUPPORT_TRADE_REFERENCE_TYPES } from "@/lib/support/support-community-filter";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */
type Q = any;

export const TRADE_AUDIT_TARGET_TYPES = [
  "trade_post",
  "post",
  "trade_report",
  "trade_restriction",
  "trade_promotion_order",
  "trade_ad_product",
  "trade_category",
  "trade_settings",
  "transaction_review",
  "product_chat",
] as const;

/** 처리 대기 문의 상태 (거래 문의 범위 · open_support) */
export const TRADE_OPEN_SUPPORT_STATUSES = ["OPEN", "WAITING_ADMIN"] as const;

/**
 * 거래 문의 범위·홍보 포인트 원장 집계 RPC (20270601182000_r7_trade_overview_promo_stats.sql).
 * 거래 홍보 주문 id 를 N건만 모아 in(...) 으로 거르거나 원장 행을 N행만 읽어 합산하지 않는다 — 전체 데이터 기준 DB 집계.
 * 문의 범위 상수는 supportTradeScopeOrFilter 와 같은 정의(SUPPORT_TRADE_REFERENCE_TYPES · SUPPORT_TRADE_CATEGORY)를 인자로 넘긴다.
 */
export const TRADE_OVERVIEW_PROMO_STATS_RPC = "admin_trade_overview_promo_stats";

export type TradeOverview = {
  period: { fromIso: string | null; toIso: string | null; fromDate: string | null; toDate: string | null };
  pending: {
    openReports: number | null;
    promotionReview: number | null;
    openSupport: number | null;
    activeRestrictions: number | null;
    overduePromotions: number | null;
  };
  current: Record<TradePostTab, number | null> & { activePromotions: number | null };
  inPeriod: {
    newPosts: number | null;
    completed: number | null;
    adminCompletedNoTime: number | null;
    reportsReceived: number | null;
    reportsProcessed: number | null;
    chatsStarted: number | null;
    promotionsStarted: number | null;
    promotionsEnded: number | null;
    promotionPointsUsed: number | null;
    promotionPointsRefunded: number | null;
    supportReceived: number | null;
    adminActions: number | null;
  };
  byCategory: { id: string | null; name: string; count: number }[] | null;
  byRegion: { lguId: string | null; name: string; count: number }[] | null;
  recentActions: { id: string; at: string; action: string; targetType: string; targetId: string; actorId: string | null }[] | null;
  errors: string[];
};

async function headCount(q: Q, errors: string[], label: string): Promise<number | null> {
  try {
    const { count, error } = await q;
    if (error) {
      errors.push(`${label}:${error.message}`);
      return null;
    }
    return typeof count === "number" ? count : null;
  } catch (e) {
    errors.push(`${label}:${e instanceof Error ? e.message : "error"}`);
    return null;
  }
}

export type LoadTradeOverviewOptions = {
  /**
   * true = 처리 대기·현재 상태·기간 건수만 (통합 대시보드 · 거래 도메인 공통 모델용).
   * 홍보 포인트 합계·카테고리/지역 분포·최근 조치는 건너뛰고 null 로 둔다. 기본 false (거래 대시보드 전체).
   */
  summaryOnly?: boolean;
};

export async function loadTradeOverview(
  sb: SupabaseClient,
  period: { fromIso: string | null; toIso: string | null; fromDate: string | null; toDate: string | null },
  options: LoadTradeOverviewOptions = {}
): Promise<TradeOverview> {
  const summaryOnly = options.summaryOnly === true;
  const errors: string[] = [];
  const s = sb as Q;
  const nowIso = new Date().toISOString();
  const range = (q: Q, col: string): Q => {
    let x = q;
    if (period.fromIso) x = x.gte(col, period.fromIso);
    if (period.toIso) x = x.lt(col, period.toIso);
    return x;
  };
  const head = (table: string) => s.from(table).select("id", { count: "exact", head: true });

  const ctxRes = await loadTradePostsContext(sb);
  if (!ctxRes.ok) errors.push(`posts_context:${ctxRes.error}`);
  const promoStatsReq = (async () => {
    try {
      const { data, error } = await sb.rpc(TRADE_OVERVIEW_PROMO_STATS_RPC, {
        p_from: period.fromIso ?? null,
        p_to: period.toIso ?? null,
        p_open_statuses: [...TRADE_OPEN_SUPPORT_STATUSES],
        p_reference_types: [...SUPPORT_TRADE_REFERENCE_TYPES],
        p_category: SUPPORT_TRADE_CATEGORY,
        p_with_points: !summaryOnly,
      });
      if (error) {
        errors.push(`trade_promo_stats:${error.message}`);
        return null;
      }
      return (data ?? null) as Record<string, unknown> | null;
    } catch (e) {
      errors.push(`trade_promo_stats:${e instanceof Error ? e.message : "error"}`);
      return null;
    }
  })();
  const statNum = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // 현재 상태 = 목록 기본 필터(주소 필터 없음)와 같은 해석 — 거래글 목록 탭 건수와 같은 값
  const listDefault = parseTradePostsFilter(new URLSearchParams());
  const postCounts = ctxRes.ok && listDefault.ok
    ? await Promise.all(
        TRADE_POST_TABS.map(async (t) => [t, await countTradePosts(sb, t, listDefault.filter, ctxRes.ctx)] as const)
      )
    : TRADE_POST_TABS.map((t) => [t, null] as const);

  const [
    openReports,
    promotionReview,
    promoStats,
    activeRestrictions,
    overduePromotions,
    activePromotions,
    newPosts,
    completed,
    adminCompletedNoTime,
    reportsReceived,
    reportsProcessed,
    chatsStarted,
    promotionsStarted,
    promotionsEnded,
    adminActions,
  ] = await Promise.all([
    headCount(applyTradeReportTabFilter(head("reports"), "open"), errors, "open_reports"),
    headCount(head("point_promotion_orders").eq("domain", "trade").eq("order_status", "pending_review"), errors, "promo_review"),
    promoStatsReq,
    headCount(
      head("sanctions")
        .eq("scope", "trade")
        .eq("sanction_type", "trade_restriction")
        .is("revoked_at", null)
        .or(`end_at.is.null,end_at.gt.${nowIso}`),
      errors,
      "active_restrictions"
    ),
    headCount(
      head("point_promotion_orders").eq("domain", "trade").eq("order_status", "active").lt("end_at", nowIso),
      errors,
      "overdue_promotions"
    ),
    headCount(
      head("point_promotion_orders")
        .eq("domain", "trade")
        .eq("order_status", "active")
        .lte("start_at", nowIso)
        .gt("end_at", nowIso),
      errors,
      "active_promotions"
    ),
    ctxRes.ok
      ? countTradePosts(sb, "all", { fromIso: period.fromIso, toIso: period.toIso }, ctxRes.ctx)
      : Promise.resolve(null),
    // 거래 완료 = 판매자 완료 처리 시각 (product_chats.seller_completed_at). 완료 시각을 만들지 않는다.
    headCount(range(head("product_chats").not("seller_completed_at", "is", null), "seller_completed_at"), errors, "completed"),
    // 판매자 완료 절차 없이 관리자가 완료로 정정한 건 — 완료 시각 없음, 따로 센다
    headCount(range(head("audit_logs").eq("action", "trade_post.force_complete"), "created_at"), errors, "admin_completed"),
    headCount(range(head("reports"), "created_at"), errors, "reports_received"),
    headCount(range(head("reports").not("resolved_at", "is", null), "resolved_at"), errors, "reports_processed"),
    headCount(range(head("chat_rooms").eq("room_type", "item_trade"), "created_at"), errors, "chats_started"),
    headCount(range(head("point_promotion_orders").eq("domain", "trade").not("start_at", "is", null).not("order_status", "in", "(pending_review,rejected,cancelled)"), "start_at"), errors, "promo_started"),
    headCount(range(head("point_promotion_orders").eq("domain", "trade").not("ended_at", "is", null), "ended_at"), errors, "promo_ended"),
    headCount(range(head("audit_logs").in("target_type", [...TRADE_AUDIT_TARGET_TYPES]), "created_at"), errors, "admin_actions"),
  ]);

  // 거래 문의(처리 대기·기간 접수) · 홍보 포인트 사용·환급 — RPC 한 번 (전체 데이터 기준).
  // 요약 모드는 원장 합계를 생략(p_with_points=false → null). RPC 실패는 null + errors (0 과 구분).
  const openSupport = promoStats ? statNum(promoStats.open_support) : null;
  const supportReceived = promoStats ? statNum(promoStats.support_received) : null;
  const promotionPointsUsed = promoStats && !summaryOnly ? statNum(promoStats.points_used) : null;
  const promotionPointsRefunded = promoStats && !summaryOnly ? statNum(promoStats.points_refunded) : null;

  // 기간 내 신규 글 — 카테고리·지역 분포 (최대 5,000행, 넘으면 null)
  let byCategory: TradeOverview["byCategory"] = null;
  let byRegion: TradeOverview["byRegion"] = null;
  if (!summaryOnly) {
    const { data, error, count } = await range(
      s.from("posts").select("id, trade_category_id, trade_lgu_id, region, city", { count: "exact" }),
      "created_at"
    ).limit(5000);
    if (error) errors.push(`distribution:${error.message}`);
    else if ((count ?? 0) <= 5000) {
      const rows = (data ?? []) as { id: string; trade_category_id: string | null }[];
      const catCount = new Map<string, number>();
      for (const r of rows) catCount.set(r.trade_category_id ?? "", (catCount.get(r.trade_category_id ?? "") ?? 0) + 1);
      const lguByPost = await resolveTradePostLguIds(sb, rows as { id: unknown }[]);
      const lguCount = new Map<string, number>();
      for (const r of rows) {
        const k = lguByPost.get(r.id) ?? "";
        lguCount.set(k, (lguCount.get(k) ?? 0) + 1);
      }
      const catIds = [...catCount.keys()].filter(Boolean);
      const lguIds = [...lguCount.keys()].filter(Boolean);
      const [cats, lgus] = await Promise.all([
        catIds.length ? s.from("categories").select("id, name").in("id", catIds) : Promise.resolve({ data: [] }),
        lguIds.length
          ? s.from("trade_national_lgu").select("canonical_id, display_name").in("canonical_id", lguIds)
          : Promise.resolve({ data: [] }),
      ]);
      const catName = new Map(((cats.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
      const lguName = new Map(
        ((lgus.data ?? []) as { canonical_id: string; display_name: string }[]).map((l) => [l.canonical_id, l.display_name])
      );
      byCategory = [...catCount.entries()]
        .map(([id, n]) => ({ id: id || null, name: id ? (catName.get(id) ?? "알 수 없는 카테고리") : "카테고리 없음", count: n }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      byRegion = [...lguCount.entries()]
        .map(([id, n]) => ({ lguId: id || null, name: id ? (lguName.get(id) ?? id) : "지역 확인 불가", count: n }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    }
  }

  let recentActions: TradeOverview["recentActions"] = null;
  if (!summaryOnly) {
    const { data, error } = await s
      .from("audit_logs")
      .select("id, created_at, action, target_type, target_id, actor_id")
      .in("target_type", [...TRADE_AUDIT_TARGET_TYPES])
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) errors.push(`recent_actions:${error.message}`);
    else
      recentActions = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        at: String(r.created_at),
        action: String(r.action ?? ""),
        targetType: String(r.target_type ?? ""),
        targetId: String(r.target_id ?? ""),
        actorId: r.actor_id ? String(r.actor_id) : null,
      }));
  }

  return {
    period,
    pending: { openReports, promotionReview, openSupport, activeRestrictions, overduePromotions },
    current: { ...(Object.fromEntries(postCounts) as Record<TradePostTab, number | null>), activePromotions },
    inPeriod: {
      newPosts,
      completed,
      adminCompletedNoTime,
      reportsReceived,
      reportsProcessed,
      chatsStarted,
      promotionsStarted,
      promotionsEnded,
      promotionPointsUsed,
      promotionPointsRefunded,
      supportReceived,
      adminActions,
    },
    byCategory,
    byRegion,
    recentActions,
    errors,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

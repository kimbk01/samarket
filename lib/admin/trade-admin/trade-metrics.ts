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
  resolveTradePostLguIds,
  TRADE_ADMIN_OPEN_REPORT_STATUSES,
} from "@/lib/admin/trade-admin/trade-posts-query";
import { TRADE_POST_TABS, type TradePostTab } from "@/lib/admin/trade-admin/trade-post-tabs";
import { supportTradeScopeOrFilter } from "@/lib/support/support-community-filter";
import { loadPromotionLedgerRelatedIds, postgrestInList } from "@/lib/points/promotion-ledger-related-ids";

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

export async function loadTradeOverview(
  sb: SupabaseClient,
  period: { fromIso: string | null; toIso: string | null; fromDate: string | null; toDate: string | null }
): Promise<TradeOverview> {
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
  const tradePromo = await loadPromotionLedgerRelatedIds(sb, "trade", 500);
  const tradeOrderIds = tradePromo.ok
    ? tradePromo.relatedIds.filter((x) => !x.includes(":"))
    : [];

  const postCounts = ctxRes.ok
    ? await Promise.all(TRADE_POST_TABS.map(async (t) => [t, await countTradePosts(sb, t, {}, ctxRes.ctx)] as const))
    : TRADE_POST_TABS.map((t) => [t, null] as const);

  const [
    openReports,
    promotionReview,
    openSupport,
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
    supportReceived,
    adminActions,
  ] = await Promise.all([
    headCount(head("reports").in("status", [...TRADE_ADMIN_OPEN_REPORT_STATUSES]), errors, "open_reports"),
    headCount(head("point_promotion_orders").eq("domain", "trade").eq("order_status", "pending_review"), errors, "promo_review"),
    headCount(
      head("support_cases").in("status", ["OPEN", "WAITING_ADMIN"]).or(supportTradeScopeOrFilter(tradeOrderIds)),
      errors,
      "open_support"
    ),
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
    headCount(range(head("support_cases").or(supportTradeScopeOrFilter(tradeOrderIds)), "created_at"), errors, "support_received"),
    headCount(range(head("audit_logs").in("target_type", [...TRADE_AUDIT_TARGET_TYPES]), "created_at"), errors, "admin_actions"),
  ]);

  // 홍보 포인트 사용·환급 (공용 원장, 거래 홍보 주문 연결 행)
  let promotionPointsUsed: number | null = null;
  let promotionPointsRefunded: number | null = null;
  if (tradePromo.ok) {
    if (tradePromo.relatedIds.length === 0) {
      promotionPointsUsed = 0;
      promotionPointsRefunded = 0;
    } else {
      const { data, error } = await range(
        s
          .from("point_ledger")
          .select("entry_type, amount")
          .eq("related_type", "promotion_order")
          .filter("related_id", "in", `(${postgrestInList(tradePromo.relatedIds)})`),
        "created_at"
      ).limit(5000);
      if (error) errors.push(`promo_points:${error.message}`);
      else {
        let used = 0;
        let refunded = 0;
        for (const r of (data ?? []) as { entry_type: string; amount: number }[]) {
          const n = Number(r.amount ?? 0);
          if (r.entry_type === "spend" || r.entry_type === "ad_hold") used += -n;
          if (r.entry_type === "ad_hold_release") used -= n;
          if (r.entry_type === "refund") refunded += n;
        }
        promotionPointsUsed = used;
        promotionPointsRefunded = refunded;
      }
    }
  } else errors.push(`promo_ledger_ids:${tradePromo.error}`);

  // 기간 내 신규 글 — 카테고리·지역 분포 (최대 5,000행, 넘으면 null)
  let byCategory: TradeOverview["byCategory"] = null;
  let byRegion: TradeOverview["byRegion"] = null;
  {
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
  {
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

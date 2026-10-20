/**
 * 통합 대시보드 출처 (서버 전용) — 레지스트리 `AdminMetricSourceKey` 마다 **이동 화면이 쓰는 로더·필터**를
 * 1번 호출해 지표 id → 값 맵으로 옮긴다 (대시보드 값 = 이동 화면 값). 새 DB 객체 없음.
 * 선택 기간(`range`, PHT)은 기간 지표·추세에 같은 경계로 쓴다.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminActionQueueCounts, type AdminActionQueuePermissionScope } from "@/lib/admin/admin-action-queue";
import { loadAdminRecentActivityLists } from "@/lib/admin-dashboard/load-admin-recent-activity";
import { loadAdminBusinessListOps } from "@/lib/admin-business/load-admin-business-list";
import {
  computeAdsWorkspaceHeroOccupancy,
  computeAdsWorkspaceSummaryCounts,
} from "@/lib/admin/advertising-workspace/workspace-summary";
import { loadAdsControlPlane } from "@/lib/admin/ads-control-plane/load-ads-control-plane";
import { adminDomainCountFromClient } from "@/lib/admin/domain-dashboard/count-exact";
import { loadCommunityDomainDashboard } from "@/lib/admin/domain-dashboard/load-community-domain-dashboard";
import { loadTradeDomainDashboard } from "@/lib/admin/domain-dashboard/load-trade-domain-dashboard";
import type { AdminDomainDashboardModel } from "@/lib/admin/domain-dashboard/types";
import type { AdminDashboardPeriodRange } from "@/lib/admin/metrics/dashboard-period";
import { manilaDateKey, manilaLastNDaysRangeUtc } from "@/lib/admin/metrics/manila-period";
import type { AdminDashboardTrendId, AdminMetricSourceKey } from "@/lib/admin/metrics/registry";
import type {
  AdminDashboardMetricEntry,
  AdminDashboardMetricMap,
  AdminDashboardSources,
} from "@/lib/admin/metrics/build-admin-dashboard-overview";
import type {
  AdminDashboardRecentGroup,
  AdminDashboardTrendPoint,
} from "@/lib/admin/metrics/dashboard-overview-contract";
import { parseAdminOrderOpsQuery } from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { loadAdminOrderOpsPage } from "@/lib/admin/store-orders/load-admin-store-order-ops";
import {
  adminMemberJoinedRangeOps,
  adminMemberStatusFilterOps,
  applyProfileFilterOps,
  type ProfileFilterOp,
} from "@/lib/admin-users/admin-member-list-query";
import { countPointChargesByStatus } from "@/lib/admin/shared-handlers/admin-point-charges-list";
import { listCommunityReportGroupsForAdmin } from "@/lib/community-feed/admin-community-reports";
import { loadFinanceTodaySummary } from "@/lib/finance/today-summary/load-finance-today-summary";
import { BUSINESS_CASH_LEDGER_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";
import {
  loadAdminStoreCashOverviewIds,
  loadStoreCashOverview,
  loadStoreCommissionBreakdown,
  loadStoreCommissionLedgerPage,
} from "@/lib/stores/commission/load-store-commission-ledger";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */

const DAY_MS = 86_400_000;
/** 추세 원본 행 상한 — 넘으면 오류(잘린 값을 그리지 않는다). */
export const ADMIN_DASHBOARD_TREND_ROW_LIMIT = 5000;

export type AdminDashboardSourcesInput = {
  sb: SupabaseClient;
  storesSb: SupabaseClient | null;
  notesSb: SupabaseClient | null;
  scope: AdminActionQueuePermissionScope;
  /** 선택 기간 (PHT) — 기간 지표 경계 */
  range: AdminDashboardPeriodRange;
  now?: Date;
};

function mapFrom(entries: Iterable<[string, AdminDashboardMetricEntry]>): AdminDashboardMetricMap {
  return new Map(entries);
}

/** 도메인 공통 모델의 `metricValues` → 지표 맵 (권한 숨김 유지). */
export function metricMapFromDomainModel(model: AdminDomainDashboardModel): AdminDashboardMetricMap {
  if (!model.metricValues) throw new Error(`${model.domain}:metric_values_missing`);
  return mapFrom(model.metricValues.map((v) => [v.id, { value: v.value, forbidden: v.forbidden }] as const));
}

/** 일별 PHT 날짜 키 (오래된 날 → 오늘). */
export function manilaDailyKeys(range: number, now: Date): string[] {
  const { rangeStartIso } = manilaLastNDaysRangeUtc(range, now);
  const start = Date.parse(rangeStartIso);
  return Array.from({ length: range }, (_, i) => manilaDateKey(new Date(start + i * DAY_MS + 3_600_000).toISOString()) ?? "");
}

/** 시각 목록 → PHT 일별 점 (series 하나). */
export function bucketDailyPht(
  keys: readonly string[],
  series: Record<string, readonly { at: string; amount?: number }[]>
): AdminDashboardTrendPoint[] {
  const points = keys.map((key) => ({ key, values: Object.fromEntries(Object.keys(series).map((s) => [s, 0])) }));
  const idx = new Map(points.map((p, i) => [p.key, i]));
  for (const [s, rows] of Object.entries(series)) {
    for (const r of rows) {
      const i = idx.get(manilaDateKey(r.at) ?? "");
      if (i !== undefined) points[i].values[s] += r.amount ?? 1;
    }
  }
  return points;
}

/** 최근 활동 목록 → 대시보드 그룹 (항목 링크 = 기존 최근 활동 패널과 같은 상세 화면). */
export function recentGroupsFromLists(
  lists: Awaited<ReturnType<typeof loadAdminRecentActivityLists>>
): AdminDashboardRecentGroup[] {
  return [
    {
      kind: "users",
      labelKo: "최근 가입 회원",
      labelEn: "Recent members",
      href: "/admin/users",
      items: lists.recentUsers.map((u) => ({ id: u.id, title: u.nickname, sub: u.memberType, at: u.joinedAt, href: `/admin/users/${u.id}` })),
    },
    {
      kind: "products",
      labelKo: "최근 거래글",
      labelEn: "Recent listings",
      href: "/admin/posts-management",
      items: lists.recentProducts.map((p) => ({ id: p.id, title: p.title, sub: p.sellerNickname, at: p.createdAt, href: `/admin/products/${p.id}` })),
    },
    {
      kind: "reports",
      labelKo: "최근 신고",
      labelEn: "Recent reports",
      href: "/admin/reports",
      items: lists.recentReports.map((r) => ({ id: r.id, title: r.reasonLabel, sub: r.targetType, at: r.createdAt, href: `/admin/reports/${r.id}` })),
    },
    {
      kind: "chats",
      labelKo: "최근 거래 채팅",
      labelEn: "Recent trade chats",
      href: "/admin/chats",
      items: lists.recentChats.map((c) => ({
        id: c.id,
        title: c.productTitle,
        sub: `${c.buyerNickname} · ${c.sellerNickname}`,
        at: c.lastMessageAt,
        href: `/admin/chats/${c.id}`,
      })),
    },
    {
      kind: "reviews",
      labelKo: "최근 거래 후기",
      labelEn: "Recent reviews",
      href: "/admin/reviews",
      items: lists.recentReviews.map((r) => ({
        id: r.id,
        title: `${r.reviewerNickname} → ${r.targetNickname}`,
        sub: String(r.rating),
        at: r.createdAt,
        href: `/admin/reviews/${r.id}`,
      })),
    },
  ];
}

export function createAdminDashboardSources(input: AdminDashboardSourcesInput): AdminDashboardSources {
  const { sb, storesSb, notesSb, scope, range } = input;
  const now = input.now ?? new Date();
  const s = sb as any;

  /** 회원 목록 API 와 같은 필터 연산으로 profiles 개수 (`/api/admin/users` summary.totalRows). */
  async function memberCount(ops: readonly ProfileFilterOp[]): Promise<number | null> {
    return adminDomainCountFromClient(sb, "profiles", (q) => applyProfileFilterOps(q, ops));
  }

  async function timestamps(
    table: string,
    column: string,
    fromIso: string,
    toIso: string,
    apply: (q: any) => any = (q) => q,
    extra = ""
  ): Promise<{ at: string; row: Record<string, unknown> }[]> {
    const { data, error, count: total } = await apply(
      s
        .from(table)
        .select(extra ? `${column}, ${extra}` : column, { count: "exact" })
        .gte(column, fromIso)
        .lt(column, toIso)
    ).limit(ADMIN_DASHBOARD_TREND_ROW_LIMIT);
    if (error) throw new Error(`${table}:${error.message ?? "query_failed"}`);
    if ((total ?? 0) > ADMIN_DASHBOARD_TREND_ROW_LIMIT) throw new Error(`${table}:too_many_rows`);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({ at: String(row[column] ?? ""), row }));
  }

  const loaders: Record<Exclude<AdminMetricSourceKey, "queue">, () => Promise<AdminDashboardMetricMap>> = {
    async members() {
      const [total, active, created, suspended, blocked, deletion] = await Promise.all([
        memberCount([]),
        memberCount(adminMemberStatusFilterOps("active")),
        memberCount(adminMemberJoinedRangeOps(range.fromDay, range.toDay)),
        memberCount(adminMemberStatusFilterOps("suspended")),
        memberCount(adminMemberStatusFilterOps("blocked")),
        adminDomainCountFromClient(sb, "account_deletion_requests", (q) => q.in("status", ["requested", "processing"])),
      ]);
      return mapFrom([
        ["members.total", { value: total }],
        ["members.active", { value: active }],
        ["members.new", { value: created }],
        ["members.suspended", { value: suspended }],
        ["members.blocked", { value: blocked }],
        ["members.deletion_requests", { value: deletion }],
      ]);
    },
    async community() {
      return metricMapFromDomainModel(await loadCommunityDomainDashboard({ scope, now }));
    },
    async trade() {
      return metricMapFromDomainModel(await loadTradeDomainDashboard(sb, { now }));
    },
    async community_reports() {
      // 신고 처리함과 같은 함수 — 같은 대상(target_type+target_id) 묶음 수, 「대기」 탭.
      const r = await listCommunityReportGroupsForAdmin({ tab: "pending", limit: 1 });
      if (!r.ok) throw new Error("community_report_groups:failed");
      return mapFrom([["community.report_targets_pending", { value: r.counts.pending }]]);
    },
    async points() {
      const c = await countPointChargesByStatus(sb);
      if (!c) throw new Error("point_charge_requests:count_failed");
      return mapFrom([
        ["points.waiting_confirm", { value: c.waiting_confirm }],
        ["points.pending", { value: c.pending }],
      ]);
    },
    async orders() {
      // 주문 목록 화면과 같은 RPC·같은 기간(custom PHT 날짜) — 탭 개수(tab_counts)를 그대로 쓴다.
      const q = parseAdminOrderOpsQuery(
        "list",
        new URLSearchParams({ period: "custom", from: range.fromDay, to: range.toDay, page_size: "1" })
      );
      const out = await loadAdminOrderOpsPage(storesSb ?? sb, q);
      if (!out.ok) throw new Error(`admin_store_order_ops_page:${out.error}`);
      const c = out.result.tabCounts;
      return mapFrom([
        ["orders.all", { value: c.all ?? null }],
        ["orders.in_progress", { value: c.in_progress ?? null }],
        ["orders.completed", { value: c.completed ?? null }],
        ["orders.cancel", { value: c.cancel ?? null }],
      ]);
    },
    async stores() {
      const res = await loadAdminBusinessListOps(sb, { page: 1, pageSize: 1 });
      if (!("ok" in res) || !res.ok) throw new Error(`business_ops_kpi:${"error" in res ? res.error : "unavailable"}`);
      return mapFrom([["stores.open_now", { value: res.kpi.openNow }]]);
    },
    async commission() {
      const [ids, period] = await Promise.all([
        loadAdminStoreCashOverviewIds(sb),
        loadStoreCommissionLedgerPage(sb, {
          storeIds: null,
          fromIso: range.fromIso,
          toIso: range.toIso,
          state: "all",
          orderNo: null,
          limit: 1,
          offset: 0,
        }),
      ]);
      const overview = await loadStoreCashOverview(sb, ids);
      return mapFrom([
        ["finance.commission_outstanding", { value: overview.positions.reduce((n, p) => n + p.outstandingMinor, 0) }],
        ["finance.commission_net", { value: period.summary.netCommissionMinor }],
      ]);
    },
    async finance_today() {
      const t = await loadFinanceTodaySummary(sb);
      return mapFrom([["finance.cash_in_today", { value: t.cashInMinor }]]);
    },
    async ads() {
      const model = await loadAdsControlPlane(sb);
      const c = computeAdsWorkspaceSummaryCounts(model, "all");
      return mapFrom([
        ["ads.hero_used", { value: computeAdsWorkspaceHeroOccupancy(model).used }],
        ["ads.live", { value: c.live }],
        ["ads.pending", { value: c.pending }],
        ["ads.scheduled", { value: c.scheduled }],
        ["ads.waiting", { value: c.waiting }],
        ["ads.incomplete", { value: c.incomplete }],
      ]);
    },
  };

  async function trend(id: AdminDashboardTrendId, days: 7 | 30): Promise<AdminDashboardTrendPoint[]> {
    const win = manilaLastNDaysRangeUtc(days, now);
    const keys = manilaDailyKeys(days, now);
    const from = win.rangeStartIso;
    const to = win.todayEndExIso;
    switch (id) {
      case "signups_orders_daily": {
        const [signups, orders] = await Promise.all([
          timestamps("profiles", "created_at", from, to),
          timestamps("store_orders", "created_at", from, to),
        ]);
        return bucketDailyPht(keys, { signups, orders });
      }
      case "signups_daily":
        return bucketDailyPht(keys, { signups: await timestamps("profiles", "created_at", from, to) });
      case "reports_daily": {
        const [trade, community] = await Promise.all([
          timestamps("reports", "created_at", from, to),
          timestamps("community_reports", "created_at", from, to),
        ]);
        return bucketDailyPht(keys, { trade, community });
      }
      case "orders_daily":
        return bucketDailyPht(keys, { orders: await timestamps("store_orders", "created_at", from, to) });
      case "commission_daily": {
        const rows = await loadStoreCommissionBreakdown(sb, { storeIds: null, fromIso: from, toIso: to, group: "day" });
        const byDay = new Map(rows.map((r) => [r.bucket, r.netCommissionMinor]));
        return keys.map((key) => ({ key, values: { commission: byDay.get(key) ?? 0 } }));
      }
      case "ad_spend_daily": {
        const rows = await timestamps(
          BUSINESS_CASH_LEDGER_TABLE,
          "created_at",
          from,
          to,
          (q) => q.eq("entry_kind", "AD_SPEND"),
          "amount_minor"
        );
        return bucketDailyPht(keys, {
          spend: rows.map((r) => ({ at: r.at, amount: Math.abs(Math.trunc(Number(r.row.amount_minor) || 0)) })),
        });
      }
      case "support_cases_daily":
        return bucketDailyPht(keys, { cases: await timestamps("support_cases", "created_at", from, to) });
    }
  }

  return {
    metrics: (key) => loaders[key](),
    queue: async () => {
      const counts = await loadAdminActionQueueCounts({
        storesSb: storesSb ?? sb,
        notesSb: notesSb ?? sb,
        permissionScope: scope,
      });
      return counts.categories;
    },
    trend,
    recent: async () => {
      const lists = await loadAdminRecentActivityLists(s, now.toISOString());
      if (lists.errors.length) throw new Error(lists.errors.join(";").slice(0, 120));
      return recentGroupsFromLists(lists);
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

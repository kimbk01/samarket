/**
 * 통합 대시보드 출처 (서버 전용) — 레지스트리 `AdminMetricSourceKey` 마다 **이동 화면이 쓰는 로더·필터**를
 * 1번 호출해 지표 id → 값 맵으로 옮긴다 (대시보드 값 = 이동 화면 값). 새 DB 객체 없음.
 * - 필터 인자는 지표 링크(`resolveAdminMetricHref`)를 **이동 화면의 파서**로 읽어 만든다 (링크 = 화면 = 대시보드).
 * - 처리 대기 항목 중 이동 화면이 다른 함수로 세는 카테고리(커뮤니티 신고·수수료 검토·주문 운영 예외)는
 *   이동 화면 함수로 다시 센 값으로 바꾼다(`alignQueueWithDestinations`) — 지표·처리 대기 목록·이동 화면이 같은 값.
 * 선택 기간(`range`, PHT)은 기간 지표·추세에 같은 경계로 쓴다. 추세는 선택 기간이 끝나는 날에서 끝난다.
 * 계약 테스트: `__tests__/dashboard-destination-contract.test.ts`.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminActionQueueCounts, type AdminActionQueuePermissionScope } from "@/lib/admin/admin-action-queue";
import {
  ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY,
  type AdminActionQueueCategory,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import { loadAdminRecentActivityLists } from "@/lib/admin-dashboard/load-admin-recent-activity";
import {
  loadAdminBusinessListOps,
  parseAdminBusinessListOpsFilters,
} from "@/lib/admin-business/load-admin-business-list";
import {
  computeAdsWorkspaceHeroOccupancy,
  computeAdsWorkspaceSummaryCounts,
} from "@/lib/admin/advertising-workspace/workspace-summary";
import { countPlatformPopupAdminCampaigns } from "@/lib/platform-popup/admin-campaign-loader";
import { PLATFORM_POPUP_LIVE_STATUS_FILTER } from "@/lib/platform-popup/admin-list-filter";
import { loadAdsControlPlane } from "@/lib/admin/ads-control-plane/load-ads-control-plane";
import { adminDomainCountFromClient } from "@/lib/admin/domain-dashboard/count-exact";
import type { AdminDomainDashboardModel } from "@/lib/admin/domain-dashboard/types";
import {
  applyAccountDeletionRequestStatusFilter,
  applyCommunityPostStatusOriginFilter,
  applyTradeReportTabFilter,
  isTradeReportTab,
  type TradeReportTab,
} from "@/lib/admin/metrics/admin-metric-filters";
import {
  adminDashboardTrendDayKeys,
  type AdminDashboardPeriodRange,
  type AdminDashboardTrendWindow,
} from "@/lib/admin/metrics/dashboard-period";
import { formatAdminManilaDate, manilaDateKey, manilaLastNDaysRangeUtc } from "@/lib/admin/metrics/manila-period";
import {
  getAdminMetricDefinition,
  resolveAdminMetricHref,
  type AdminDashboardTrendId,
  type AdminMetricSourceKey,
} from "@/lib/admin/metrics/registry";
import { listAdminNotificationCampaigns } from "@/lib/admin/notification-campaigns/campaign-list-service";
import { parseCampaignListQuery } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { parseTradePostTab } from "@/lib/admin/trade-admin/trade-post-tabs";
import {
  countTradePosts,
  loadTradePostsContext,
  parseTradePostsFilter,
} from "@/lib/admin/trade-admin/trade-posts-query";
import type {
  AdminDashboardMetricEntry,
  AdminDashboardMetricMap,
  AdminDashboardSources,
} from "@/lib/admin/metrics/build-admin-dashboard-overview";
import type {
  AdminDashboardNoticeItem,
  AdminDashboardNoticeState,
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
import {
  listCommunityReportGroupsForAdmin,
  resolveCommunityReportInboxTab,
  type CommunityReportTargetFilter,
} from "@/lib/community-feed/admin-community-reports";
import { parseCommunityAdminPeriod } from "@/lib/admin/community-admin/community-admin-period";
import { loadFinanceTodaySummary } from "@/lib/finance/today-summary/load-finance-today-summary";
import { APP_NOTICES_CONTENT_SELECT, isCustomerCenterContentPublishedNow } from "@/lib/notices/customer-center-content";
import { sumStoreCashOutstandingMinor } from "@/lib/stores/commission/store-commission-contract";
import { parseStoreCommissionLedgerQuery } from "@/lib/stores/commission/store-commission-ledger-query";
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

/** 대시보드 공지 블록 — 최신 5건 */
export const ADMIN_DASHBOARD_NOTICE_LIMIT = 5;

/** 공지 상태 (고객센터 게시 판정과 같은 규칙) */
export function adminDashboardNoticeState(
  row: {
    is_active?: boolean | null;
    starts_at?: string | null;
    ends_at?: string | null;
    archived_at?: string | null;
    deleted_at?: string | null;
  },
  now: Date
): AdminDashboardNoticeState {
  if (isCustomerCenterContentPublishedNow(row)) return "published";
  if (row.deleted_at || row.archived_at || !row.is_active) return "hidden";
  const starts = Date.parse(String(row.starts_at ?? ""));
  if (Number.isFinite(starts) && starts > now.getTime()) return "scheduled";
  return "ended";
}

/**
 * 처리 대기 카테고리 → 이동 화면이 세는 함수 (대시보드에서만 바꾼다; 관리자 벨 등 다른 화면은 레지스트리 값 그대로).
 * 실패 = 그 카테고리 「확인 불가」(레지스트리 값으로 대신하지 않는다 — 다른 숫자를 보이지 않기 위해).
 */
export async function alignQueueWithDestinations(
  categories: readonly AdminActionQueueCategoryResult[],
  destinations: Partial<Record<AdminActionQueueCategory, () => Promise<number | null>>>
): Promise<AdminActionQueueCategoryResult[]> {
  return Promise.all(
    categories.map(async (c) => {
      const count = destinations[c.key];
      if (!count || c.status === "forbidden") return { ...c };
      const n = await count().catch(() => null);
      return n === null ? { ...c, count: null, status: "unavailable" as const } : { ...c, count: n, status: "ok" as const };
    })
  );
}

export function createAdminDashboardSources(input: AdminDashboardSourcesInput): AdminDashboardSources {
  const { sb, storesSb, notesSb, scope, range } = input;
  const now = input.now ?? new Date();
  const s = sb as any;
  const todayPht = formatAdminManilaDate(now);

  /** 지표 링크의 쿼리 — 이동 화면 파서에 그대로 넣는다. */
  function hrefParams(metricId: string): URLSearchParams {
    const href = resolveAdminMetricHref(getAdminMetricDefinition(metricId), { todayPht, range });
    return new URL(href, "http://admin.local").searchParams;
  }
  /** 처리 대기 카테고리의 목록 링크 쿼리 */
  function queueListParams(key: AdminActionQueueCategory): URLSearchParams {
    const href = ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(key)?.listHref ?? "/admin";
    return new URL(href, "http://admin.local").searchParams;
  }

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

  /** 커뮤니티 신고 처리함 묶음 — 지표와 처리 대기 항목이 같은 1회 결과를 쓴다. */
  let reportGroupsMemo: Promise<number> | null = null;
  const communityReportTargetsPending = () =>
    (reportGroupsMemo ??= (async () => {
      // 신고 처리함 화면(app/admin/community/reports)과 같은 해석: 탭 · 대상 종류 · 접수 기간
      const sp = hrefParams("community.report_targets_pending");
      const tab = resolveCommunityReportInboxTab({ status: sp.get("status"), pending: sp.get("pending") });
      const typeRaw = sp.get("type") ?? "";
      const targetType: CommunityReportTargetFilter =
        typeRaw === "post" || typeRaw === "comment" || typeRaw === "user" ? typeRaw : "";
      const period = parseCommunityAdminPeriod({ period: sp.get("period"), from: sp.get("from"), to: sp.get("to") });
      const r = await listCommunityReportGroupsForAdmin({
        tab,
        targetType,
        createdFromIso: period.ok ? period.fromIso : null,
        createdToIso: period.ok ? period.toIso : null,
        limit: 1,
        offset: 0,
      });
      if (!r.ok) throw new Error("community_report_groups:failed");
      // 조회 상한에 걸리면 묶음 수가 바닥값 → 확인 불가
      if (r.truncated) throw new Error("community_report_groups:truncated");
      return r.counts[tab];
    })());

  /** 수수료 원장 「검토 필요」 = 처리 대기 「수수료 검토」 링크(/admin/store-settlements?state=review_required) */
  async function settlementsReviewTotal(): Promise<number> {
    const q = parseStoreCommissionLedgerQuery(queueListParams("settlements_actionable"), now);
    const page = await loadStoreCommissionLedgerPage(sb, {
      storeIds: q.storeId ? [q.storeId] : null,
      fromIso: q.fromIso,
      toIso: q.toIso,
      state: q.state,
      orderNo: q.orderNo,
      limit: 1,
      offset: 0,
    });
    return page.totalRows;
  }

  /** 처리 필요 주문 화면(exceptions) total = 처리 대기 「주문 운영 예외」 링크 */
  async function ordersAttentionTotal(): Promise<number> {
    const sp = queueListParams("orders_attention");
    sp.set("page_size", "1");
    const out = await loadAdminOrderOpsPage(storesSb ?? sb, parseAdminOrderOpsQuery("exceptions", sp));
    if (!out.ok) throw new Error(`admin_store_order_ops_page:${out.error}`);
    return out.result.total;
  }

  const loaders: Record<Exclude<AdminMetricSourceKey, "queue">, () => Promise<AdminDashboardMetricMap>> = {
    async members() {
      const deletionStatus = hrefParams("members.deletion_requests").get("status") ?? "open";
      const [total, active, created, suspended, blocked, deletion] = await Promise.all([
        memberCount([]),
        memberCount(adminMemberStatusFilterOps("active")),
        memberCount(adminMemberJoinedRangeOps(range.fromDay, range.toDay)),
        memberCount(adminMemberStatusFilterOps("suspended")),
        memberCount(adminMemberStatusFilterOps("blocked")),
        adminDomainCountFromClient(sb, "account_deletion_requests", (q) =>
          applyAccountDeletionRequestStatusFilter(q, deletionStatus)
        ),
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
      // 커뮤니티 글 화면: 탭(tab) = 상태(status) 로 API 에 넘긴다 · origin 그대로
      const sp = hrefParams("community.posts_active.member");
      const value = await adminDomainCountFromClient(notesSb ?? sb, "community_posts", (q) =>
        applyCommunityPostStatusOriginFilter(q, { status: sp.get("tab"), origin: sp.get("origin") })
      );
      return mapFrom([["community.posts_active.member", { value }]]);
    },
    async trade() {
      const ctxRes = await loadTradePostsContext(sb);
      if (!ctxRes.ok) throw new Error(`trade_posts_context:${ctxRes.error}`);
      const ctx = ctxRes.ctx;
      const postCount = async (id: string) => {
        const sp = hrefParams(id);
        const parsed = parseTradePostsFilter(sp);
        if (!parsed.ok) throw new Error(`trade_posts_filter:${parsed.error}`);
        return countTradePosts(sb, parseTradePostTab(sp.get("tab")), parsed.filter, ctx);
      };
      const reportTabRaw = (hrefParams("trade.reports_open").get("tab") ?? "open").trim();
      if (!isTradeReportTab(reportTabRaw)) throw new Error("trade_reports:invalid_tab");
      const reportTab: TradeReportTab = reportTabRaw;
      const [selling, sold, hidden, reportsOpen] = await Promise.all([
        postCount("trade.posts.selling"),
        postCount("trade.posts.sold"),
        postCount("trade.posts.admin_hidden"),
        adminDomainCountFromClient(sb, "reports", (q) => applyTradeReportTabFilter(q, reportTab)),
      ]);
      return mapFrom([
        ["trade.posts.selling", { value: selling }],
        ["trade.posts.sold", { value: sold }],
        ["trade.posts.admin_hidden", { value: hidden }],
        ["trade.reports_open", { value: reportsOpen }],
      ]);
    },
    async community_reports() {
      // 신고 처리함과 같은 함수 — 같은 대상(target_type+target_id) 묶음 수, 「대기」 탭.
      return mapFrom([["community.report_targets_pending", { value: await communityReportTargetsPending() }]]);
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
      const res = await loadAdminBusinessListOps(sb, {
        ...parseAdminBusinessListOpsFilters(hrefParams("stores.open_now")),
        page: 1,
        pageSize: 1,
      });
      if (!("ok" in res) || !res.ok) throw new Error(`business_ops_kpi:${"error" in res ? res.error : "unavailable"}`);
      return mapFrom([["stores.open_now", { value: res.kpi.openNow }]]);
    },
    async commission() {
      const net = parseStoreCommissionLedgerQuery(hrefParams("finance.commission_net"), now);
      const [ids, period] = await Promise.all([
        loadAdminStoreCashOverviewIds(sb),
        loadStoreCommissionLedgerPage(sb, {
          storeIds: null,
          fromIso: net.fromIso,
          toIso: net.toIso,
          state: net.state,
          orderNo: null,
          limit: 1,
          offset: 0,
        }),
      ]);
      const overview = await loadStoreCashOverview(sb, ids);
      return mapFrom([
        ["finance.commission_outstanding", { value: sumStoreCashOutstandingMinor(overview.positions) }],
        ["finance.commission_net", { value: period.summary.netCommissionMinor }],
      ]);
    },
    async finance_today() {
      const t = await loadFinanceTodaySummary(sb);
      return mapFrom([["finance.cash_in_today", { value: t.cashInMinor }]]);
    },
    async ads() {
      // 집행 중 팝업 = 팝업 목록 「지금 노출 중」 필터와 같은 함수·같은 클라이언트(service)
      const [model, popupLive] = await Promise.all([
        loadAdsControlPlane(sb),
        countPlatformPopupAdminCampaigns(notesSb ?? sb, { scope: "popup", status: PLATFORM_POPUP_LIVE_STATUS_FILTER }),
      ]);
      if (!popupLive.ok) throw new Error(`platform_popup_live:${popupLive.error}`);
      const c = computeAdsWorkspaceSummaryCounts(model, "all");
      return mapFrom([
        ["ads.hero_used", { value: computeAdsWorkspaceHeroOccupancy(model).used }],
        ["ads.live", { value: c.live }],
        ["ads.pending", { value: c.pending }],
        ["ads.scheduled", { value: c.scheduled }],
        ["ads.waiting", { value: c.waiting }],
        ["ads.popup_live", { value: popupLive.total }],
      ]);
    },
    async notifications() {
      // 알림 발송 화면과 같은 질의(parseCampaignListQuery) — total 만 쓰므로 1행만 읽는다.
      const svc = notesSb ?? sb;
      const ids = [
        "notifications.campaigns_failed",
        "notifications.campaigns_partially_failed",
        "notifications.campaigns_in_progress",
      ];
      const values = await Promise.all(
        ids.map(async (id) => {
          const sp = hrefParams(id);
          sp.set("page_size", "1");
          const r = await listAdminNotificationCampaigns(svc, parseCampaignListQuery(sp));
          return r.ok ? r.total : null;
        })
      );
      return mapFrom(ids.map((id, i) => [id, { value: values[i] }] as [string, AdminDashboardMetricEntry]));
    },
  };

  async function trend(id: AdminDashboardTrendId, window: AdminDashboardTrendWindow): Promise<AdminDashboardTrendPoint[]> {
    const keys = adminDashboardTrendDayKeys(window);
    const from = window.fromIso;
    const to = window.toIso;
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
      case "members_activity_daily": {
        // 마지막 로그인 날짜별 회원 수 — 회원당 하루 (정의: registry ADMIN_DASHBOARD_ACTIVE_7D_DEFINITION_KO)
        const [signups, active] = await Promise.all([
          timestamps("profiles", "created_at", from, to),
          timestamps("profiles", "last_login_at", from, to),
        ]);
        return bucketDailyPht(keys, { signups, active });
      }
      case "reports_daily": {
        const [tradeRows, community] = await Promise.all([
          timestamps("reports", "created_at", from, to),
          timestamps("community_reports", "created_at", from, to),
        ]);
        return bucketDailyPht(keys, { trade: tradeRows, community });
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
      return alignQueueWithDestinations(counts.categories, {
        community_reports: communityReportTargetsPending,
        settlements_actionable: settlementsReviewTotal,
        orders_attention: ordersAttentionTotal,
      });
    },
    trend,
    recent: async () => {
      const lists = await loadAdminRecentActivityLists(s, now.toISOString());
      if (lists.errors.length) throw new Error(lists.errors.join(";").slice(0, 120));
      return recentGroupsFromLists(lists);
    },
    notices: async (): Promise<AdminDashboardNoticeItem[]> => {
      // 관리자 「공지·고객센터」 목록(/api/admin/app-notices)과 같은 원장·같은 정렬 — 최신 5건
      const { data, error } = await (notesSb ?? sb)
        .from("app_notices")
        .select(APP_NOTICES_CONTENT_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(ADMIN_DASHBOARD_NOTICE_LIMIT);
      if (error) throw new Error(`app_notices:${error.message ?? "query_failed"}`);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
        const id = String(r.id ?? "");
        return {
          id,
          title: String(r.title ?? ""),
          contentType: String(r.content_type ?? "notice"),
          state: adminDashboardNoticeState(
            {
              is_active: r.is_active === true,
              starts_at: (r.starts_at as string | null) ?? null,
              ends_at: (r.ends_at as string | null) ?? null,
              archived_at: (r.archived_at as string | null) ?? null,
              deleted_at: (r.deleted_at as string | null) ?? null,
            },
            now
          ),
          at: String(r.published_at ?? r.created_at ?? "") || null,
          href: `/admin/app/notices/${encodeURIComponent(id)}`,
        };
      });
    },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

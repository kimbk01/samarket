/**
 * 통합 대시보드 출처 (서버 전용) — 레지스트리 `AdminMetricSourceKey` 마다 **기존 로더**를 1번 호출해
 * 지표 id → 값 맵으로 옮긴다. 새 DB 객체·대형 스캔 없음 (COUNT 는 인덱스 열 / 작은 테이블만).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminActionQueueCounts, type AdminActionQueuePermissionScope } from "@/lib/admin/admin-action-queue";
import { parseAdminDashboardAggregateRpc } from "@/lib/admin-dashboard/admin-dashboard-rpc-map";
import { loadAdsControlPlane } from "@/lib/admin/ads-control-plane/load-ads-control-plane";
import { adminDomainCountExact, adminDomainCountFromClient } from "@/lib/admin/domain-dashboard/count-exact";
import { loadCommunityDomainDashboard } from "@/lib/admin/domain-dashboard/load-community-domain-dashboard";
import { loadTradeDomainDashboard } from "@/lib/admin/domain-dashboard/load-trade-domain-dashboard";
import type { AdminDomainDashboardModel } from "@/lib/admin/domain-dashboard/types";
import { CHAT_METRIC_DEFINITIONS } from "@/lib/admin/metrics/chat-metrics";
import { DELIVERY_METRIC_DEFINITIONS } from "@/lib/admin/metrics/delivery-metrics";
import { loadChatMetrics } from "@/lib/admin/metrics/load-chat-metrics";
import { loadDeliveryMetrics } from "@/lib/admin/metrics/load-delivery-metrics";
import {
  manilaDateKey,
  manilaHourFromUtcHour,
  manilaLastNDaysRangeUtc,
  manilaTodayRangeUtc,
} from "@/lib/admin/metrics/manila-period";
import type { AdminDashboardTrendId, AdminMetricSourceKey } from "@/lib/admin/metrics/registry";
import type {
  AdminDashboardMetricEntry,
  AdminDashboardMetricMap,
  AdminDashboardSources,
} from "@/lib/admin/metrics/build-admin-dashboard-overview";
import type { AdminDashboardTrendPoint } from "@/lib/admin/metrics/dashboard-overview-contract";
import { ADMIN_STORE_ORDERS_TAB_STATUSES } from "@/lib/admin/store-orders/admin-store-orders-contract";
import { loadFinanceTodaySummary } from "@/lib/finance/today-summary/load-finance-today-summary";
import { BUSINESS_CASH_LEDGER_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";
import { loadStoreCommissionBreakdown } from "@/lib/stores/commission/load-store-commission-ledger";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */

const DAY_MS = 86_400_000;
/** 추세 원본 행 상한 — 넘으면 오류(잘린 값을 그리지 않는다). */
export const ADMIN_DASHBOARD_TREND_ROW_LIMIT = 5000;

export type AdminDashboardSourcesInput = {
  sb: SupabaseClient;
  storesSb: SupabaseClient | null;
  notesSb: SupabaseClient | null;
  scope: AdminActionQueuePermissionScope;
  now?: Date;
};

function mapFrom(entries: Iterable<[string, AdminDashboardMetricEntry]>): AdminDashboardMetricMap {
  return new Map(entries);
}

/** 도메인 공통 모델의 `metricValues` → 지표 맵 (구역·권한 숨김 유지). */
export function metricMapFromDomainModel(model: AdminDomainDashboardModel): AdminDashboardMetricMap {
  if (!model.metricValues) throw new Error(`${model.domain}:metric_values_missing`);
  return mapFrom(
    model.metricValues.map((v) => [v.id, { value: v.value, forbidden: v.forbidden, section: v.section }] as const)
  );
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

/** 시각 목록 → PHT 0–23시 점. */
export function bucketHourlyPht(seriesKey: string, rows: readonly { at: string }[]): AdminDashboardTrendPoint[] {
  const points = Array.from({ length: 24 }, (_, h) => ({ key: String(h).padStart(2, "0"), values: { [seriesKey]: 0 } }));
  for (const r of rows) {
    const ms = Date.parse(r.at);
    if (!Number.isFinite(ms)) continue;
    points[manilaHourFromUtcHour(new Date(ms).getUTCHours())].values[seriesKey] += 1;
  }
  return points;
}

export function createAdminDashboardSources(input: AdminDashboardSourcesInput): AdminDashboardSources {
  const { sb, storesSb, notesSb, scope } = input;
  const now = input.now ?? new Date();
  const s = sb as any;
  const today = manilaTodayRangeUtc(now);

  async function count(table: string, apply: (q: any) => any): Promise<number | null> {
    return adminDomainCountFromClient(sb, table, apply);
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
    async aggregate() {
      const { data, error } = await s.rpc("admin_dashboard_aggregate_json", { p_today_start: today.fromIso });
      if (error) throw new Error(`admin_dashboard_aggregate_json:${error.message ?? "rpc_failed"}`);
      const { stats, userSummary } = parseAdminDashboardAggregateRpc(data, now.toISOString());
      return mapFrom([
        ["members.total", { value: stats.totalUsers }],
        ["members.new_today", { value: stats.newUsersToday }],
        ["members.sanctioned", { value: userSummary.suspended + userSummary.banned }],
      ]);
    },
    async members() {
      const { rangeStartIso } = manilaLastNDaysRangeUtc(7, now);
      const [active, phone, deletion] = await Promise.all([
        count("profiles", (q) => q.gte("last_login_at", rangeStartIso)),
        count("profiles", (q) => q.eq("phone_verified", true)),
        count("account_deletion_requests", (q) => q.in("status", ["requested", "processing"])),
      ]);
      return mapFrom([
        ["members.active_7d", { value: active }],
        ["members.phone_verified", { value: phone }],
        ["members.deletion_requests", { value: deletion }],
      ]);
    },
    async community() {
      return metricMapFromDomainModel(await loadCommunityDomainDashboard({ scope, now }));
    },
    async trade() {
      return metricMapFromDomainModel(await loadTradeDomainDashboard(sb, { now }));
    },
    async delivery() {
      const { values } = await loadDeliveryMetrics(sb, now);
      return mapFrom(
        DELIVERY_METRIC_DEFINITIONS.map((d) => {
          const v = values.get(d.id);
          return [d.id, { value: v?.value ?? null, forbidden: v?.forbidden ?? false, section: d.section }] as const;
        })
      );
    },
    async chat() {
      const { values } = await loadChatMetrics(sb, now);
      return mapFrom(
        CHAT_METRIC_DEFINITIONS.map((d) => {
          const v = values.get(d.id);
          return [d.id, { value: v?.value ?? null, forbidden: v?.forbidden ?? false, section: d.section }] as const;
        })
      );
    },
    async orders_today() {
      const inToday = (q: any) => q.gte("created_at", today.fromIso).lt("created_at", today.toIso);
      const [completed, cancelled] = await Promise.all([
        count("store_orders", (q) => inToday(q).in("order_status", [...ADMIN_STORE_ORDERS_TAB_STATUSES.completed])),
        count("store_orders", (q) => inToday(q).in("order_status", [...ADMIN_STORE_ORDERS_TAB_STATUSES.cancel])),
      ]);
      return mapFrom([
        ["delivery.orders_completed_today", { value: completed }],
        ["delivery.orders_cancelled_today", { value: cancelled }],
      ]);
    },
    async commission() {
      const week = manilaLastNDaysRangeUtc(7, now);
      const [all, last7] = await Promise.all([
        loadStoreCommissionBreakdown(sb, { storeIds: null, fromIso: null, toIso: null, group: "month" }),
        loadStoreCommissionBreakdown(sb, {
          storeIds: null,
          fromIso: week.rangeStartIso,
          toIso: week.todayEndExIso,
          group: "day",
        }),
      ]);
      return mapFrom([
        ["finance.commission_outstanding", { value: all.reduce((n, r) => n + r.feeOutstandingMinor, 0) }],
        ["finance.commission_7d", { value: last7.reduce((n, r) => n + r.netCommissionMinor, 0) }],
      ]);
    },
    async finance_today() {
      const t = await loadFinanceTodaySummary(sb);
      return mapFrom([["finance.cash_in_today", { value: t.cashInMinor }]]);
    },
    async ads() {
      const m = await loadAdsControlPlane(sb);
      const blocking = m.queues.collisionBlocking;
      return mapFrom([
        ["ads.live", { value: m.currentExecution.length }],
        ["ads.popups_active", { value: m.currentExecution.filter((r) => r.domain === "popup").length }],
        ["ads.collisions_blocking", { value: blocking.unavailable ? null : blocking.count }],
      ]);
    },
    async notifications_today() {
      const inToday = (q: any) => q.gte("created_at", today.fromIso).lt("created_at", today.toIso);
      const [sent, failed] = await Promise.all([
        adminDomainCountExact(() =>
          inToday(s.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("status", "sent"))
        ),
        adminDomainCountExact(() =>
          inToday(s.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("status", "failed"))
        ),
      ]);
      return mapFrom([
        ["notifications.sent_today", { value: sent }],
        ["notifications.failed_today", { value: failed }],
      ]);
    },
  };

  async function trend(id: AdminDashboardTrendId, range: 7 | 30): Promise<AdminDashboardTrendPoint[]> {
    const win = manilaLastNDaysRangeUtc(range, now);
    const keys = manilaDailyKeys(range, now);
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
      case "orders_hourly_today":
        return bucketHourlyPht("orders", await timestamps("store_orders", "created_at", today.fromIso, today.toIso));
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
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

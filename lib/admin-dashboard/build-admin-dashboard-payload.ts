/**
 * Admin dashboard payload — GET /api/admin/stats/dashboard and RSC.
 * KPIs + trend: admin_dashboard_aggregate_json, admin_dashboard_trend_utc_json.
 * SQL: supabase/migrations/20260415150000_admin_dashboard_aggregate_rpc.sql
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  parseAdminDashboardAggregateRpc,
  parseAdminDashboardTrendRpc,
} from "@/lib/admin-dashboard/admin-dashboard-rpc-map";
import { loadAdminRecentActivityLists } from "@/lib/admin-dashboard/load-admin-recent-activity";
import { manilaTodayStartUtcIso } from "@/lib/admin/metrics/manila-period";
import type { DashboardPayload } from "@/lib/types/admin-dashboard";

export async function buildAdminDashboardPayload(): Promise<DashboardPayload> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    throw new Error("server_config");
  }
  const now = new Date();
  const nowIso = now.toISOString();
  /** V3-13: 「오늘」 = 마닐라 자정(PHT 00:00) — 서버 TZ 자정 아님. */
  const todayStart = manilaTodayStartUtcIso(now);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST RPC 호출
  const sbAny = sb as any;

  const [aggRes, trendRes, recent] = await Promise.all([
    sbAny.rpc("admin_dashboard_aggregate_json", { p_today_start: todayStart }),
    sbAny.rpc("admin_dashboard_trend_utc_json"),
    loadAdminRecentActivityLists(sbAny, nowIso),
  ]);
  const { recentProducts, recentUsers, recentReports, recentChats, recentReviews } = recent;

  if (aggRes.error) {
    throw new Error(
      `admin_dashboard_aggregate_json: ${aggRes.error.message ?? "rpc failed"}`
    );
  }
  if (trendRes.error) {
    throw new Error(
      `admin_dashboard_trend_utc_json: ${trendRes.error.message ?? "rpc failed"}`
    );
  }

  const { stats, productSummary, reportSummary, chatSummary, userSummary } = parseAdminDashboardAggregateRpc(
    aggRes.data,
    nowIso
  );
  const trend = parseAdminDashboardTrendRpc(trendRes.data);

  return {
    stats,
    productSummary,
    userSummary,
    reportSummary,
    chatSummary,
    recentProducts,
    recentUsers,
    recentReports,
    recentChats,
    recentReviews,
    trend,
  };
}

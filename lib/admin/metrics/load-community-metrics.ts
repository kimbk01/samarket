/**
 * 커뮤니티 지표 값 로더 (서버 전용) — `community-metrics.ts` 정의를 실제 값으로 채운다.
 * 카드 집계 = head count 병렬, 기간 통계 = RPC `admin_community_period_stats` 1회 (설계 §D-6).
 * 실패 = null (「확인 불가」), 0 으로 대체하지 않는다.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";
import { COMMUNITY_REPORT_ADMIN_ACTIONABLE } from "@/lib/admin/admin-ops-actionable-status";
import { adminDomainCountExact } from "@/lib/admin/domain-dashboard/count-exact";
import { manilaLastNDaysRangeUtc } from "@/lib/admin/metrics/manila-period";
import {
  COMMUNITY_METRIC_DEFINITIONS,
  resolveCommunityDirectMetric,
  resolveCommunityPeriodMetric,
  resolveCommunityQueueMetric,
  type CommunityMetricScope,
  type CommunityMetricValue,
} from "@/lib/admin/metrics/community-metrics";
import { supportAppealOrFilter, supportCommunityScopeOrFilter } from "@/lib/support/support-community-filter";

/** RPC 결과 (admin_community_period_stats) — 화면·CSV 가 읽는 구조 */
export type AdminCommunityPeriodStats = {
  ok: true;
  from: string;
  to: string;
  posts: Record<"total" | "member" | "imported" | "admin" | "active_now" | "hidden_now" | "deleted_now", number>;
  comments: Record<"total" | "top_level" | "replies", number>;
  authors: Record<"active" | "new", number>;
  reports: Record<"received" | "processed" | "resolved" | "dismissed" | "meeting_received" | "meeting_processed", number>;
  admin_actions: { total: number; by_action: Record<string, number>; by_target_type: Record<string, number> };
  engagement: Record<"post_views" | "post_likes" | "comment_likes", number>;
  topics: { topic_id: string | null; name: string | null; slug: string | null; posts: number; comments: number }[];
  points: { related_type: string; entry_type: string; count: number; amount: number }[];
  charges: Record<"approved_count" | "approved_payment_amount" | "approved_point_amount" | "rejected_count", number>;
  promotions: Record<"new_count" | "new_point_cost" | "ended_count", number>;
  daily: {
    date: string;
    posts: number;
    posts_member: number;
    posts_imported: number;
    comments: number;
    active_authors: number;
    reports: number;
    admin_actions: number;
    points_rewarded: number;
    points_reclaimed: number;
  }[];
};

function isMissingRpc(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  return err.code === "PGRST202" || err.code === "42883" || /could not find the function|does not exist/i.test(String(err.message ?? ""));
}

export async function loadCommunityPeriodStats(
  sb: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<{ ok: true; stats: AdminCommunityPeriodStats } | { ok: false; error: string }> {
  try {
    const { data, error } = await sb.rpc("admin_community_period_stats", { p_from: fromIso, p_to: toIso });
    if (error) return { ok: false, error: isMissingRpc(error) ? "rpc_missing" : error.message };
    const res = (data ?? {}) as { ok?: boolean; error?: string };
    if (res.ok !== true) return { ok: false, error: res.error ?? "stats_failed" };
    return { ok: true, stats: data as AdminCommunityPeriodStats };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "stats_failed" };
  }
}

const CSV_COLUMNS = [
  "date",
  "posts",
  "posts_member",
  "posts_imported",
  "comments",
  "active_authors",
  "reports",
  "admin_actions",
  "points_rewarded",
  "points_reclaimed",
] as const;

/** 일별 추이 CSV (마닐라 날짜) */
export function communityStatsDailyCsv(stats: Pick<AdminCommunityPeriodStats, "daily">): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const d of stats.daily ?? []) {
    lines.push(CSV_COLUMNS.map((c) => String((d as Record<string, unknown>)[c] ?? "")).join(","));
  }
  return `﻿${lines.join("\n")}\n`;
}

export type CommunityMetricsSnapshot = {
  values: ReadonlyMap<string, CommunityMetricValue>;
  stats: AdminCommunityPeriodStats | null;
  sectionErrors: string[];
  lastUpdatedAt: string;
};

export type CommunityMetricsPeriod = {
  period: string;
  fromIso: string;
  toIso: string;
  /** 마닐라 날짜 (포함) */
  from: string | null;
  to: string | null;
};

export async function loadCommunityMetrics(
  sb: SupabaseClient,
  input: { period: CommunityMetricsPeriod; scope?: CommunityMetricScope; now?: Date }
): Promise<CommunityMetricsSnapshot> {
  const now = input.now ?? new Date();
  const scope = input.scope ?? null;
  const sectionErrors: string[] = [];
  const sbAny = sb as any;
  const head = { count: "exact" as const, head: true };
  const count = (name: string, run: () => any) =>
    adminDomainCountExact(run).then((v) => {
      if (v == null) sectionErrors.push(`${name}:unavailable`);
      return v;
    });
  const staleIso = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const last7From = manilaLastNDaysRangeUtc(7, now).rangeStartIso;
  const nowIso = now.toISOString();

  const [queueRes, direct, statsRes] = await Promise.all([
    loadAdminActionQueueCounts({ storesSb: sbAny, notesSb: sbAny, permissionScope: scope ?? undefined }).catch(
      (e: unknown) => {
        sectionErrors.push(`action_queue:${e instanceof Error ? e.message : "error"}`);
        return null;
      }
    ),
    Promise.all([
      count("support_waiting", () =>
        sbAny
          .from("support_cases")
          .select("id", head)
          .in("status", ["OPEN", "WAITING_ADMIN"])
          .or(supportCommunityScopeOrFilter())
      ),
      count("appeals_waiting", () =>
        sbAny.from("support_cases").select("id", head).in("status", ["OPEN", "WAITING_ADMIN"]).or(supportAppealOrFilter())
      ),
      count("meetings_pending_approval", () =>
        sbAny.from("meetings").select("id", head).eq("platform_approval_status", "pending_approval")
      ),
      count("import_failures_7d", () =>
        sbAny
          .from("community_import_jobs")
          .select("id", head)
          .gte("created_at", last7From)
          .or("status.eq.failed,failed_count.gt.0")
      ),
      count("reports_stale_24h", () =>
        sbAny
          .from("community_reports")
          .select("id", head)
          .in("status", [...COMMUNITY_REPORT_ADMIN_ACTIONABLE])
          .lt("created_at", staleIso)
      ),
      count("posts_active_member", () =>
        sbAny.from("community_posts").select("id", head).eq("status", "active").eq("origin_kind", "member")
      ),
      count("posts_active_imported", () =>
        sbAny.from("community_posts").select("id", head).eq("status", "active").eq("origin_kind", "imported")
      ),
      count("posts_hidden", () => sbAny.from("community_posts").select("id", head).eq("status", "hidden")),
      count("comments_hidden", () => sbAny.from("community_comments").select("id", head).eq("status", "hidden")),
      count("posts_deleted", () => sbAny.from("community_posts").select("id", head).eq("status", "deleted")),
      count("comments_deleted", () => sbAny.from("community_comments").select("id", head).eq("status", "deleted")),
      count("restrictions_active", () =>
        sbAny
          .from("sanctions")
          .select("id", head)
          .eq("scope", "community")
          .eq("sanction_type", "community_restriction")
          .is("revoked_at", null)
          .or(`end_at.is.null,end_at.gt.${nowIso}`)
      ),
      sbAny
        .rpc("admin_community_members", { p_account: "suspended", p_limit: 1, p_offset: 0 })
        .then((r: { data: { ok?: boolean; total?: number } | null; error: { message?: string } | null }) => {
          if (r.error || r.data?.ok !== true || typeof r.data.total !== "number") {
            sectionErrors.push(`suspended_authors:${r.error?.message ?? "unavailable"}`);
            return null;
          }
          return r.data.total;
        })
        .catch(() => {
          sectionErrors.push("suspended_authors:error");
          return null;
        }) as Promise<number | null>,
      count("promotions_running", () =>
        sbAny.from("point_promotion_orders").select("id", head).eq("domain", "community").eq("order_status", "active")
      ),
    ]),
    loadCommunityPeriodStats(sb, input.period.fromIso, input.period.toIso),
  ]);

  const [
    supportWaiting,
    appealsWaiting,
    meetingsPending,
    importFailures,
    staleReports,
    postsActiveMember,
    postsActiveImported,
    postsHidden,
    commentsHidden,
    postsDeleted,
    commentsDeleted,
    restrictionsActive,
    suspendedAuthors,
    promotionsRunning,
  ] = direct;
  const directValues: Record<string, number | null> = {
    "community.support_waiting": supportWaiting,
    "community.appeals_waiting": appealsWaiting,
    "community.meetings_pending_approval": meetingsPending,
    "community.import_failures_7d": importFailures,
    "community.reports_stale_24h": staleReports,
    "community.posts_active.member": postsActiveMember,
    "community.posts_active.imported": postsActiveImported,
    "community.posts_hidden": postsHidden,
    "community.comments_hidden": commentsHidden,
    "community.posts_deleted": postsDeleted,
    "community.comments_deleted": commentsDeleted,
    "community.restrictions_active": restrictionsActive,
    "community.suspended_authors": suspendedAuthors,
    "community.promotions_running": promotionsRunning,
  };

  const stats = statsRes.ok ? statsRes.stats : null;
  if (!statsRes.ok) sectionErrors.push(`period_stats:${statsRes.error}`);
  const range = { period: input.period.period, from: input.period.from, to: input.period.to };

  const values = new Map<string, CommunityMetricValue>();
  for (const def of COMMUNITY_METRIC_DEFINITIONS) {
    const v =
      def.source.kind === "queue"
        ? resolveCommunityQueueMetric(def, queueRes?.categories ?? null, scope)
        : def.source.kind === "period_stats"
          ? resolveCommunityPeriodMetric(def, stats, range, scope)
          : resolveCommunityDirectMetric(def, directValues[def.id], scope);
    values.set(def.id, v);
  }
  return { values, stats, sectionErrors, lastUpdatedAt: new Date().toISOString() };
}

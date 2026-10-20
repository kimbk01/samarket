/**
 * 통합 신고 목록 서버 페이지 (R7 — 고정 조회 상한 제거).
 * 예전: 거래 신고(처리 대기 2000 + 처리 완료 300건) + 커뮤니티 신고(최신 300건)를 브라우저에서 합쳐 필터.
 * 지금: RPC `admin_reports_unified_page` 한 번 — 두 원장 UNION ALL · 필터(도메인·상태·대상 유형·사유·대상 id) ·
 * 결정적 정렬(created_at DESC, id DESC) · limit/offset · 정확한 total (supabase/migrations/20270601120000_r7_admin_reports_unified_page.sql).
 * 행 변환은 기존 규칙 그대로 (`mapTradeReportRowsForAdmin` · `enrichCommunityReportRowsForAdmin` + `mapCommunityReportsToReports`).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";
import { mapTradeReportRowsForAdmin, type ReportRow } from "@/lib/admin-reports/admin-reports-read.server";
import { mapCommunityReportsToReports } from "@/lib/admin-reports/map-community-reports";
import {
  REPORT_STATUS_OPTIONS,
  resolveAdminReportDomainFromQuery,
  type AdminReportDomainFilter,
} from "@/lib/admin-reports/report-admin-utils";
import { enrichCommunityReportRowsForAdmin } from "@/lib/community-feed/admin-community-reports";
import type { Report } from "@/lib/types/report";

export const ADMIN_REPORTS_UNIFIED_PAGE_RPC = "admin_reports_unified_page" as const;
export const ADMIN_REPORTS_PAGE_MAX_LIMIT = 100;

const STATUS_VALUES = new Set(REPORT_STATUS_OPTIONS.map((o) => o.value).filter(Boolean) as string[]);
const TARGET_TYPES = new Set(["product", "community", "chat", "user"]);

export type AdminReportsPageQuery = {
  domain: AdminReportDomainFilter;
  status: string;
  targetType: string;
  reason: string;
  target: string;
  limit: number;
  offset: number;
};

/** `GET /api/admin/reports` 이 페이지 모드인지 — limit/offset 이 있을 때만 (없으면 예전 응답 그대로). */
export function isAdminReportsPageRequest(sp: URLSearchParams): boolean {
  return sp.has("limit") || sp.has("offset");
}

export function parseAdminReportsPageQuery(sp: URLSearchParams): AdminReportsPageQuery {
  const page = parseAdminListPage(sp, { defaultLimit: 20, maxLimit: ADMIN_REPORTS_PAGE_MAX_LIMIT });
  const status = (sp.get("status") ?? "").trim();
  const targetType = (sp.get("target_type") ?? sp.get("targetType") ?? "").trim().toLowerCase();
  return {
    domain: resolveAdminReportDomainFromQuery({ domain: sp.get("domain"), from: sp.get("from") }),
    status: STATUS_VALUES.has(status) ? status : "",
    targetType: TARGET_TYPES.has(targetType) ? targetType : "",
    reason: (sp.get("reason") ?? "").trim().slice(0, 60),
    target: (sp.get("target") ?? "").trim().slice(0, 100),
    limit: page.limit,
    offset: page.offset,
  };
}

export function adminReportsPageRpcArgs(q: AdminReportsPageQuery) {
  const sources =
    q.domain === "reports" ? ["reports"] : q.domain === "community_feed" ? ["community_feed"] : ["reports", "community_feed"];
  return {
    p_sources: sources,
    p_status: q.status || null,
    p_target_type: q.targetType || null,
    p_reason: q.reason || null,
    p_target_q: q.target || null,
    p_limit: q.limit,
    p_offset: q.offset,
  };
}

type RpcRow = { source?: string; id?: string; row?: Record<string, unknown> };

export async function loadAdminUnifiedReportsPage(
  sb: SupabaseClient,
  q: AdminReportsPageQuery
): Promise<{ reports: Report[]; total: number; limit: number; offset: number }> {
  const { data, error } = await sb.rpc(ADMIN_REPORTS_UNIFIED_PAGE_RPC, adminReportsPageRpcArgs(q));
  if (error) throw new Error(error.message || "reports_load_failed");
  const o = (data ?? {}) as { total?: unknown; rows?: unknown };
  const rows = Array.isArray(o.rows) ? (o.rows as RpcRow[]) : [];
  const total = Math.max(0, Math.trunc(Number(o.total) || 0));

  const tradeRaw = rows.filter((r) => r.source === "reports" && r.row).map((r) => r.row as unknown as ReportRow);
  const communityRaw = rows.filter((r) => r.source === "community_feed" && r.row).map((r) => r.row as Record<string, unknown>);

  const [tradeMapped, communityRows] = await Promise.all([
    tradeRaw.length ? mapTradeReportRowsForAdmin(sb, tradeRaw) : Promise.resolve([] as Report[]),
    communityRaw.length ? enrichCommunityReportRowsForAdmin(communityRaw) : Promise.resolve([]),
  ]);
  const nicknameById: Record<string, string> = {};
  for (const r of communityRows) {
    if (r.reporter_identity && r.reporter_label) nicknameById[r.reporter_id] = r.reporter_label;
  }
  const communityMapped = mapCommunityReportsToReports(communityRows, nicknameById);

  // RPC 순서(정렬 결과)대로 다시 놓는다.
  const byKey = new Map<string, Report>();
  for (const r of tradeMapped) byKey.set(`reports:${r.id}`, r);
  for (const r of communityMapped) byKey.set(`community_feed:${r.id}`, r);
  const reports = rows
    .map((r) => byKey.get(`${r.source}:${r.id}`))
    .filter((r): r is Report => Boolean(r));

  return { reports, total, limit: q.limit, offset: q.offset };
}

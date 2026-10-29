/**
 * 통합 신고 목록 서버 페이지 (R7 — 고정 조회 상한 제거).
 * 예전: 거래 신고(처리 대기 2000 + 처리 완료 300건) + 커뮤니티 신고(최신 300건)를 브라우저에서 합쳐 필터.
 * 지금: RPC `admin_reports_unified_page` 한 번 — 두 원장 UNION ALL · 필터(도메인·상태·대상 유형·사유·대상 id) ·
 * 결정적 정렬(created_at DESC, id DESC) · limit/offset · 정확한 total (supabase/migrations/20270601120000_r7_admin_reports_unified_page.sql).
 * 행 변환은 기존 규칙 그대로 (`mapTradeReportRowsForAdmin` · `enrichCommunityReportRowsForAdmin` + `mapCommunityReportsToReports`).
 *
 * RS-02 (감사 2026-10-30 · J-5 TS 조회, DB 무변경) — 커서 모드(`cursor` 파라미터, 첫 쪽은 빈 값):
 * 원장 6종(위 2종 + store_reports · meeting_reports · community_messenger_reports · chat_reports)을 원장마다
 * page+1 건씩 읽어 병합 정렬한다 (`admin-ledger-merge.ts`). 추가 4종은 조회만 — 행 링크가 도메인 처리 화면.
 * 권한: 원장마다 그 도메인 화면의 열람 권한(`admin-route-access`)이 없으면 행·건수에서 빼고 `partial` 로 알린다.
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
import type { AdminApiActor } from "@/lib/admin/require-admin-permission";
import { canAccessAdminRoute } from "@/lib/admin/access/admin-route-access";
import {
  decodeLedgerCursor,
  ledgerKeysetOrFilter,
  mergeLedgerPage,
  type LedgerSourceBatch,
  type LedgerSourceCursor,
} from "@/lib/admin-reports/admin-ledger-merge";
import {
  ADMIN_REPORT_LEDGER_SOURCES,
  ADMIN_REPORT_LEDGER_TARGET_TYPE,
  ADMIN_REPORT_LEDGER_VIEW_HREF,
  ADMIN_REPORT_READ_ONLY_LEDGERS,
  adminReportLedgerProcessHref,
  adminReportLedgerRawStatuses,
  adminReportLedgerUiStatus,
  type AdminReportLedgerSource,
  type AdminReportReadOnlyLedger,
} from "@/lib/admin-reports/admin-report-ledger-sources";

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
  /** RS-02 커서 모드 — `cursor` 파라미터가 있으면(빈 값 = 첫 쪽) 원장 6종 병합. 없으면 예전 offset 모드(2종 RPC). */
  cursorMode: boolean;
  cursor: string;
};

/** `GET /api/admin/reports` 이 페이지 모드인지 — limit/offset/cursor 가 있을 때만 (없으면 예전 응답 그대로). */
export function isAdminReportsPageRequest(sp: URLSearchParams): boolean {
  return sp.has("limit") || sp.has("offset") || sp.has("cursor");
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
    cursorMode: sp.has("cursor"),
    cursor: (sp.get("cursor") ?? "").trim(),
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

// ── RS-02 원장 6종 커서 모드 ─────────────────────────────────────────

export type AdminReportLedgerExclusion = {
  source: AdminReportLedgerSource;
  /** permission = 열람 권한 없음(행·건수 제외) · filter = 사유·대상 id 조건을 그 원장에 적용할 수 없어 제외 */
  reason: "permission" | "filter";
};

export type AdminReportsCursorPage = {
  reports: Report[];
  /** = Σ sourceCounts (권한·조건으로 포함된 원장만) */
  total: number;
  limit: number;
  offset: number;
  nextCursor: string | null;
  sourceCounts: Partial<Record<AdminReportLedgerSource, number>>;
  includedSources: AdminReportLedgerSource[];
  excludedSources: AdminReportLedgerExclusion[];
  /** 권한 때문에 빠진 원장이 있다 — 화면 「일부 원장 제외됨」 */
  partial: boolean;
};

/** 원장별 열람 가능 여부 — 최고관리자 전부 · 그 외 도메인 화면 열람 권한 (정지 운영자는 가드에서 이미 차단). */
export function adminReportLedgerViewAllowed(
  actor: Pick<AdminApiActor, "role" | "permissions" | "isSuperAdmin">,
  source: AdminReportReadOnlyLedger
): boolean {
  if (actor.isSuperAdmin) return true;
  return canAccessAdminRoute(ADMIN_REPORT_LEDGER_VIEW_HREF[source], {
    role: actor.role,
    permissions: actor.permissions ?? [],
    accountSuspended: false,
  });
}

/** 포함 원장 결정 (순수) — 도메인 필터 → 권한 → 적용 불가 조건 → 대상 유형. */
export function resolveAdminReportLedgers(
  q: Pick<AdminReportsPageQuery, "domain" | "targetType" | "reason" | "target">,
  canView: (s: AdminReportReadOnlyLedger) => boolean
): { included: AdminReportLedgerSource[]; excluded: AdminReportLedgerExclusion[] } {
  if (q.domain === "reports") return { included: ["reports"], excluded: [] };
  if (q.domain === "community_feed") return { included: ["community_feed"], excluded: [] };
  const included: AdminReportLedgerSource[] = ["reports", "community_feed"];
  const excluded: AdminReportLedgerExclusion[] = [];
  for (const src of ADMIN_REPORT_READ_ONLY_LEDGERS) {
    if (!canView(src)) {
      excluded.push({ source: src, reason: "permission" });
      continue;
    }
    // 대상 유형이 다르면 그 원장에는 해당 행이 없다 (제외 표시 없음)
    if (q.targetType && ADMIN_REPORT_LEDGER_TARGET_TYPE[src] !== q.targetType) continue;
    // 사유 코드·대상 id 부분 일치는 원장마다 어휘·열이 달라 적용할 수 없다 → 제외하고 알린다
    if (q.reason || q.target) {
      excluded.push({ source: src, reason: "filter" });
      continue;
    }
    included.push(src);
  }
  return { included, excluded };
}

type LedgerItem = { source: AdminReportLedgerSource; id: string; createdAt: string; report: Report };

const READ_ONLY_SELECT: Record<AdminReportReadOnlyLedger, { table: string; cols: string }> = {
  store_reports: {
    table: "store_reports",
    cols: "id, reporter_user_id, target_type, target_id, store_id, reason_type, message, status, reviewed_at, created_at",
  },
  meeting_reports: {
    table: "meeting_reports",
    cols: "id, meeting_id, target_type, target_id, reporter_user_id, reason_type, reason_detail, status, reviewed_at, created_at",
  },
  community_messenger_reports: {
    table: "community_messenger_reports",
    cols: "id, report_type, room_id, message_id, reported_user_id, reporter_user_id, reason_type, reason_detail, status, handled_at, created_at",
  },
  chat_reports: {
    table: "chat_reports",
    cols: "id, room_id, message_id, report_type, reporter_user_id, reported_user_id, reason_type, reason_detail, status, updated_at, created_at",
  },
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

/** 추가 원장 행 → 화면 행 (조회 전용 · 처리 링크 = 도메인 화면). */
export function mapReadOnlyLedgerRow(source: AdminReportReadOnlyLedger, r: Record<string, unknown>): Report {
  const status = adminReportLedgerUiStatus(source, str(r.status));
  const reason = str(r.reason_type);
  const isChat = source === "community_messenger_reports" || source === "chat_reports";
  const roomId = isChat ? str(r.room_id) : "";
  const targetId = isChat ? str(r.message_id) || roomId : str(r.target_id);
  const handledAt =
    source === "community_messenger_reports" ? str(r.handled_at)
    : source === "chat_reports" ? (status === "pending" || status === "reviewing" ? "" : str(r.updated_at))
    : str(r.reviewed_at);
  return {
    id: str(r.id),
    reporterId: str(r.reporter_user_id),
    targetType: ADMIN_REPORT_LEDGER_TARGET_TYPE[source],
    targetId,
    targetUserId: str(r.reported_user_id),
    reasonCode: reason,
    reasonLabel: reason || "-",
    detail: str(r.reason_detail) || str(r.message),
    createdAt: str(r.created_at),
    status,
    ...(handledAt ? { resolvedAt: handledAt } : {}),
    ledgerSource: source,
    ledgerReadOnly: true,
    adminDetailHref: adminReportLedgerProcessHref(source, { id: str(r.id), uiStatus: status, roomId }),
  };
}

const RPC_PAGE_CAP = ADMIN_REPORTS_PAGE_MAX_LIMIT;

async function loadRpcLedgerBatch(
  sb: SupabaseClient,
  source: "reports" | "community_feed",
  q: AdminReportsPageQuery,
  cursor: LedgerSourceCursor | null
): Promise<LedgerSourceBatch<LedgerItem>> {
  const done = cursor?.k === "done";
  const offset = cursor?.k === "offset" ? cursor.o : 0;
  // RPC 는 한 번에 최대 100건 — page+1 이 넘치면 더 있음 판정은 total 로 한다 (offset 원장).
  const { data, error } = await sb.rpc(ADMIN_REPORTS_UNIFIED_PAGE_RPC, {
    ...adminReportsPageRpcArgs({ ...q, domain: source }),
    p_limit: done ? 1 : Math.min(q.limit + 1, RPC_PAGE_CAP),
    p_offset: done ? 0 : offset,
  });
  if (error) throw new Error(error.message || "reports_load_failed");
  const o = (data ?? {}) as { total?: unknown; rows?: unknown };
  const count = Math.max(0, Math.trunc(Number(o.total) || 0));
  const raw = done ? [] : Array.isArray(o.rows) ? (o.rows as RpcRow[]).filter((r) => r.source === source && r.row) : [];
  let mapped: Report[] = [];
  if (raw.length && source === "reports") {
    mapped = await mapTradeReportRowsForAdmin(sb, raw.map((r) => r.row as unknown as ReportRow));
  } else if (raw.length) {
    const communityRows = await enrichCommunityReportRowsForAdmin(raw.map((r) => r.row as Record<string, unknown>));
    const nicknameById: Record<string, string> = {};
    for (const r of communityRows) {
      if (r.reporter_identity && r.reporter_label) nicknameById[r.reporter_id] = r.reporter_label;
    }
    mapped = mapCommunityReportsToReports(communityRows, nicknameById);
  }
  const byId = new Map(mapped.map((r) => [r.id, r]));
  const rows: LedgerItem[] = [];
  for (const r of raw) {
    const report = byId.get(String(r.id));
    if (!report) continue;
    const createdAt = str((r as { created_at?: unknown }).created_at) || report.createdAt;
    rows.push({ source, id: String(r.id), createdAt, report: { ...report, ledgerSource: source } });
  }
  return { source, mode: "offset", cursor, rows, count };
}

async function loadReadOnlyLedgerBatch(
  sb: SupabaseClient,
  source: AdminReportReadOnlyLedger,
  q: AdminReportsPageQuery,
  cursor: LedgerSourceCursor | null
): Promise<LedgerSourceBatch<LedgerItem>> {
  const { table, cols } = READ_ONLY_SELECT[source];
  const statuses = adminReportLedgerRawStatuses(source, q.status);
  if (statuses && statuses.length === 0) return { source, mode: "keyset", cursor, rows: [], count: 0 };
  const done = cursor?.k === "done";

  let cq = sb.from(table).select("id", { count: "exact", head: true });
  if (statuses) cq = cq.in("status", statuses);
  const countP = cq;

  let rowsP: PromiseLike<{ data: unknown; error: { message?: string } | null }> | null = null;
  if (!done) {
    let rq = sb.from(table).select(cols);
    if (statuses) rq = rq.in("status", statuses);
    if (cursor?.k === "keyset") rq = rq.or(ledgerKeysetOrFilter(cursor));
    rowsP = rq.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(q.limit + 1);
  }
  const [countRes, rowsRes] = await Promise.all([countP, rowsP ?? Promise.resolve({ data: [], error: null })]);
  if (countRes.error) throw new Error(countRes.error.message || `${source}_count_failed`);
  if (rowsRes.error) throw new Error(rowsRes.error.message || `${source}_load_failed`);
  const rows: LedgerItem[] = ((rowsRes.data ?? []) as Record<string, unknown>[]).map((r) => {
    const report = mapReadOnlyLedgerRow(source, r);
    return { source, id: report.id, createdAt: report.createdAt, report };
  });
  return { source, mode: "keyset", cursor, rows, count: countRes.count ?? rows.length };
}

/** 추가 원장 신고자 닉네임 (한 번) */
async function fillReadOnlyReporterNicknames(sb: SupabaseClient, reports: Report[]): Promise<void> {
  const ids = [...new Set(reports.filter((r) => r.ledgerReadOnly && r.reporterId).map((r) => r.reporterId))];
  if (!ids.length) return;
  const { data } = await sb.from("profiles").select("id, nickname").in("id", ids);
  const nick = new Map(((data ?? []) as { id: string; nickname?: string | null }[]).map((p) => [String(p.id), str(p.nickname)]));
  for (const r of reports) {
    if (r.ledgerReadOnly && nick.get(r.reporterId)) r.reporterNickname = nick.get(r.reporterId);
  }
}

/** RS-02 — 원장 6종 병합 커서 페이지. */
export async function loadAdminUnifiedReportsCursorPage(
  sb: SupabaseClient,
  q: AdminReportsPageQuery,
  actor: Pick<AdminApiActor, "role" | "permissions" | "isSuperAdmin">
): Promise<AdminReportsCursorPage> {
  const { included, excluded } = resolveAdminReportLedgers(q, (src) => adminReportLedgerViewAllowed(actor, src));
  const cursors = decodeLedgerCursor(q.cursor, ADMIN_REPORT_LEDGER_SOURCES) ?? {};
  const batches = await Promise.all(
    included.map((src) =>
      src === "reports" || src === "community_feed"
        ? loadRpcLedgerBatch(sb, src, q, cursors[src] ?? null)
        : loadReadOnlyLedgerBatch(sb, src, q, cursors[src] ?? null)
    )
  );
  const merged = mergeLedgerPage(batches, q.limit);
  const reports = merged.rows.map((r) => r.report);
  await fillReadOnlyReporterNicknames(sb, reports);
  return {
    reports,
    total: merged.total,
    limit: q.limit,
    offset: 0,
    nextCursor: merged.nextCursor,
    sourceCounts: merged.sourceCounts as Partial<Record<AdminReportLedgerSource, number>>,
    includedSources: included,
    excludedSources: excluded,
    partial: excluded.some((e) => e.reason === "permission"),
  };
}

/**
 * 제재 기록 원장 3종 통합 조회 (감사 2026-10-30 RS-02 · 보완 §2 · J-5 TS 조회, DB 무변경). 서버 전용.
 * report_actions(신고 처리 기록) · sanctions(거래·커뮤니티 기능 제한·경고) · user_moderation_events(계정 정지·차단·복구)를
 * 원장마다 page+1 건씩 (created_at DESC, id DESC) 읽어 병합한다 (`admin-ledger-merge.ts`). 쓰기 없음.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  mapSanctionLedgerModerationEventRow,
  mapSanctionLedgerSanctionRow,
  resolveSanctionLedgerSources,
  SANCTION_LEDGER_SOURCES,
  SANCTION_SCOPE_VIEW_HREF,
  type AdminSanctionLedgerRow,
  type SanctionLedgerExclusion,
  type SanctionLedgerQuery,
  type SanctionLedgerSource,
} from "@/lib/admin-reports/admin-sanction-ledger-query";

type ActionRow = {
  id: string;
  report_id: string;
  action_type: string;
  action_note: string | null;
  created_by: string | null;
  created_at: string;
};

type ReportRow = {
  id: string;
  target_type: string | null;
  target_id: string | null;
  reporter_id: string | null;
  reason_code: string | null;
  reason_text: string | null;
  status: string | null;
  resolved_at: string | null;
};

/** report_actions 행 + 신고(대상·사유·상태) + 닉네임 → 제재 기록 행 (예전 offset 모드와 같은 변환). */
export async function enrichReportActionLedgerRows(
  sb: SupabaseClient,
  actions: ActionRow[],
  extraProfileIds: string[] = []
): Promise<{ rows: AdminSanctionLedgerRow[]; nickById: Map<string, string> }> {
  const repIds = [...new Set(actions.map((a) => a.report_id))];
  const reportById = new Map<string, ReportRow>();
  if (repIds.length) {
    const { data: reps } = await sb
      .from("reports")
      .select("id, target_type, target_id, reporter_id, reason_code, reason_text, status, resolved_at")
      .in("id", repIds);
    for (const r of (reps ?? []) as ReportRow[]) reportById.set(r.id, r);
  }

  const profileIds = new Set<string>(extraProfileIds.filter(Boolean));
  for (const a of actions) if (a.created_by) profileIds.add(a.created_by);
  for (const r of reportById.values()) if (r.target_type === "user" && r.target_id) profileIds.add(r.target_id);
  const nickById = new Map<string, string>();
  if (profileIds.size) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", [...profileIds]);
    for (const p of (profiles ?? []) as { id: string; nickname: string | null }[]) {
      if (p.nickname) nickById.set(String(p.id), p.nickname);
    }
  }

  const rows: AdminSanctionLedgerRow[] = actions.map((a) => {
    const r = reportById.get(a.report_id);
    const targetId = r?.target_id ?? "";
    return {
      action_id: a.id,
      report_id: a.report_id,
      action_type: a.action_type,
      action_note: a.action_note,
      admin_id: a.created_by,
      admin_nickname: a.created_by ? nickById.get(a.created_by) ?? null : null,
      action_at: a.created_at,
      target_type: r?.target_type ?? "",
      target_id: targetId,
      target_nickname: r?.target_type === "user" ? nickById.get(targetId) ?? null : null,
      reporter_id: r?.reporter_id ?? "",
      reason_code: r?.reason_code ?? "",
      reason_text: r?.reason_text ?? null,
      report_status: r?.status ?? "",
      resolved_at: r?.resolved_at ?? null,
    };
  });
  return { rows, nickById };
}

export type SanctionLedgerCursorPage = {
  rows: AdminSanctionLedgerRow[];
  total: number;
  limit: number;
  offset: number;
  nextCursor: string | null;
  sourceCounts: Partial<Record<SanctionLedgerSource, number>>;
  includedSources: SanctionLedgerSource[];
  excludedSources: SanctionLedgerExclusion[];
  /** 권한 때문에 빠진 원장(scope)이 있다 — 화면 「일부 원장 제외됨」 */
  partial: boolean;
};

type Item = { source: SanctionLedgerSource; id: string; createdAt: string; raw: Record<string, unknown> };

const SELECT: Record<SanctionLedgerSource, { table: string; cols: string }> = {
  report_actions: { table: "report_actions", cols: "id, report_id, action_type, action_note, created_by, created_at" },
  sanctions: {
    table: "sanctions",
    cols: "id, user_id, sanction_type, restriction, scope, reason, created_by, created_at, end_at, revoked_at, source_report_id",
  },
  user_moderation_events: {
    table: "user_moderation_events",
    cols: "id, user_id, actor_id, action, from_status, to_status, reason, created_at",
  },
};

/** sanctions scope 별 열람 가능 — 최고관리자 전부 · 그 외 그 scope 도메인 화면 열람 권한. */
export function sanctionScopeViewAllowed(
  actor: Pick<AdminApiActor, "role" | "permissions" | "isSuperAdmin">,
  scope: string
): boolean {
  if (actor.isSuperAdmin) return true;
  const href = SANCTION_SCOPE_VIEW_HREF[scope];
  if (!href) return false;
  return canAccessAdminRoute(href, { role: actor.role, permissions: actor.permissions ?? [], accountSuspended: false });
}

/**
 * 커서 모드 페이지. `target` = 대상 회원 id 목록(null = 조건 없음) · `reportIds` = 그 회원 대상 신고 id(report_actions 용).
 */
export async function loadSanctionLedgerCursorPage(
  sb: SupabaseClient,
  q: SanctionLedgerQuery,
  rawCursor: string,
  actor: Pick<AdminApiActor, "role" | "permissions" | "isSuperAdmin">,
  scopeFilter: { targetIds: string[] | null; reportIds: string[] | null }
): Promise<SanctionLedgerCursorPage> {
  const limit = q.page.limit;
  const { included, sanctionScopes, excluded } = resolveSanctionLedgerSources(q, (scope) =>
    sanctionScopeViewAllowed(actor, scope)
  );
  const cursors = decodeLedgerCursor(rawCursor, SANCTION_LEDGER_SOURCES) ?? {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST builder chain
  const applyFilters = (src: SanctionLedgerSource, b: any) => {
    let x = b;
    if (q.fromIso) x = x.gte("created_at", q.fromIso);
    if (q.toIso) x = x.lt("created_at", q.toIso);
    if (src === "report_actions") {
      if (q.actionType) x = x.eq("action_type", q.actionType);
      if (scopeFilter.reportIds) x = x.in("report_id", scopeFilter.reportIds);
    } else if (scopeFilter.targetIds) {
      x = x.in("user_id", scopeFilter.targetIds);
    }
    if (src === "sanctions") x = x.in("scope", sanctionScopes);
    return x;
  };

  const loadBatch = async (src: SanctionLedgerSource, cursor: LedgerSourceCursor | null): Promise<LedgerSourceBatch<Item>> => {
    const { table, cols } = SELECT[src];
    if (src === "report_actions" && scopeFilter.reportIds && scopeFilter.reportIds.length === 0) {
      return { source: src, mode: "keyset", cursor, rows: [], count: 0 };
    }
    if (src !== "report_actions" && scopeFilter.targetIds && scopeFilter.targetIds.length === 0) {
      return { source: src, mode: "keyset", cursor, rows: [], count: 0 };
    }
    const countP = applyFilters(src, sb.from(table).select("id", { count: "exact", head: true }));
    let rowsP: PromiseLike<{ data: unknown; error: { message?: string } | null }> = Promise.resolve({ data: [], error: null });
    if (cursor?.k !== "done") {
      let rq = applyFilters(src, sb.from(table).select(cols));
      if (cursor?.k === "keyset") rq = rq.or(ledgerKeysetOrFilter(cursor));
      rowsP = rq.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
    }
    const [countRes, rowsRes] = await Promise.all([countP, rowsP]);
    if (countRes.error) throw new Error(countRes.error.message || `${src}_count_failed`);
    if (rowsRes.error) throw new Error(rowsRes.error.message || `${src}_load_failed`);
    const rows = ((rowsRes.data ?? []) as Record<string, unknown>[]).map((raw) => ({
      source: src,
      id: String(raw.id),
      createdAt: String(raw.created_at ?? ""),
      raw,
    }));
    return { source: src, mode: "keyset", cursor, rows, count: countRes.count ?? rows.length };
  };

  const batches = await Promise.all(included.map((src) => loadBatch(src, cursors[src] ?? null)));
  const merged = mergeLedgerPage(batches, limit);

  const actions = merged.rows.filter((i) => i.source === "report_actions").map((i) => i.raw as unknown as ActionRow);
  const others = merged.rows.filter((i) => i.source !== "report_actions");
  const extraIds = others.flatMap((i) => [
    String(i.raw.user_id ?? ""),
    String(i.raw.created_by ?? i.raw.actor_id ?? ""),
  ]);
  const { rows: actionRows, nickById } = await enrichReportActionLedgerRows(sb, actions, extraIds);
  const nick = (id: string | null | undefined) => (id ? nickById.get(String(id)) ?? null : null);
  const actionById = new Map(actionRows.map((r) => [r.action_id, r]));
  const rows: AdminSanctionLedgerRow[] = merged.rows.map((i) => {
    if (i.source === "report_actions") {
      const raw = i.raw as unknown as ActionRow;
      const r = actionById.get(i.id);
      return {
        ...(r ?? {
          action_id: raw.id, report_id: raw.report_id, action_type: raw.action_type, action_note: raw.action_note,
          admin_id: raw.created_by, admin_nickname: nick(raw.created_by), action_at: raw.created_at,
          target_type: "", target_id: "", target_nickname: null, reporter_id: "", reason_code: "",
          reason_text: null, report_status: "", resolved_at: null,
        }),
        source: "report_actions",
        source_href: `/admin/reports/${encodeURIComponent(raw.report_id)}`,
      };
    }
    return i.source === "sanctions"
      ? mapSanctionLedgerSanctionRow(i.raw as Parameters<typeof mapSanctionLedgerSanctionRow>[0], nick)
      : mapSanctionLedgerModerationEventRow(i.raw as Parameters<typeof mapSanctionLedgerModerationEventRow>[0], nick);
  });

  return {
    rows,
    total: merged.total,
    limit,
    offset: 0,
    nextCursor: merged.nextCursor,
    sourceCounts: merged.sourceCounts as Partial<Record<SanctionLedgerSource, number>>,
    includedSources: included,
    excludedSources: excluded,
    partial: excluded.some((e) => e.reason === "permission"),
  };
}

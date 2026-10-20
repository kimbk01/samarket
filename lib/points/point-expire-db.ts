import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PointExpireExecution,
  PointExpireLog,
  PointExpirePolicy,
} from "@/lib/types/point-expire";
import type { PointLedgerEntry } from "@/lib/types/point";
import { POINT_LEDGER_ROW_SELECT } from "@/lib/points/point-query-select";
import { isEntryExpirable } from "@/lib/points/point-expire-utils";
import { isMissingPointsTable, normalizeLedgerRow } from "@/lib/points/admin-user-points-shared";

function rowToExpirePolicy(row: Record<string, unknown>): PointExpirePolicy {
  const exclude = row.exclude_entry_types;
  return {
    id: String(row.id ?? ""),
    policyName: String(row.policy_name ?? ""),
    isActive: Boolean(row.is_active),
    expireAfterDays: Number(row.expire_after_days ?? 0),
    minBalanceToExpire:
      row.min_balance_to_expire == null ? undefined : Number(row.min_balance_to_expire),
    excludeEntryTypes: Array.isArray(exclude)
      ? (exclude as PointExpirePolicy["excludeEntryTypes"])
      : [],
    allowUserView: Boolean(row.allow_user_view),
    autoExpireEnabled: Boolean(row.auto_expire_enabled),
    runCycle: (String(row.run_cycle ?? "daily") as PointExpirePolicy["runCycle"]),
    adminMemo: row.admin_memo ? String(row.admin_memo) : undefined,
    updatedAt: String(row.updated_at ?? ""),
  };
}

function rowToExpireExecution(row: Record<string, unknown>): PointExpireExecution {
  return {
    id: String(row.id ?? ""),
    executionDate: String(row.execution_date ?? ""),
    policyId: String(row.policy_id ?? ""),
    targetUserId: String(row.target_user_id ?? ""),
    targetUserNickname: String(row.target_user_nickname ?? ""),
    totalCandidatePoint: Number(row.total_candidate_point ?? 0),
    expiredPoint: Number(row.expired_point ?? 0),
    remainingPoint: Number(row.remaining_point ?? 0),
    executionStatus: (String(row.execution_status ?? "success") as PointExpireExecution["executionStatus"]),
    reason: row.reason ? String(row.reason) : undefined,
    createdAt: String(row.created_at ?? ""),
  };
}

function rowToExpireLog(row: Record<string, unknown>): PointExpireLog {
  return {
    id: String(row.id ?? ""),
    executionId: String(row.execution_id ?? ""),
    ledgerEntryId: String(row.ledger_entry_id ?? ""),
    userId: String(row.user_id ?? ""),
    userNickname: String(row.user_nickname ?? ""),
    expiredPoint: Number(row.expired_point ?? 0),
    expiresAt: String(row.expires_at ?? ""),
    actionType: (String(row.action_type ?? "expire") as PointExpireLog["actionType"]),
    actorType: (String(row.actor_type ?? "system") as PointExpireLog["actorType"]),
    createdAt: String(row.created_at ?? ""),
    note: row.note ? String(row.note) : undefined,
  };
}

export async function listPointExpirePolicies(sb: SupabaseClient): Promise<PointExpirePolicy[]> {
  const { data, error } = await sb.from("point_expire_policies").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToExpirePolicy(r as Record<string, unknown>));
}

export type PointExpirePolicyPatch = Partial<
  Pick<
    PointExpirePolicy,
    | "policyName"
    | "isActive"
    | "expireAfterDays"
    | "minBalanceToExpire"
    | "excludeEntryTypes"
    | "allowUserView"
    | "autoExpireEnabled"
    | "runCycle"
    | "adminMemo"
  >
>;

export async function updatePointExpirePolicyDb(
  sb: SupabaseClient,
  id: string,
  patch: PointExpirePolicyPatch
): Promise<PointExpirePolicy> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.policyName !== undefined) payload.policy_name = patch.policyName;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;
  if (patch.expireAfterDays !== undefined) payload.expire_after_days = patch.expireAfterDays;
  if (patch.minBalanceToExpire !== undefined) payload.min_balance_to_expire = patch.minBalanceToExpire;
  if (patch.excludeEntryTypes !== undefined) payload.exclude_entry_types = patch.excludeEntryTypes;
  if (patch.allowUserView !== undefined) payload.allow_user_view = patch.allowUserView;
  if (patch.autoExpireEnabled !== undefined) payload.auto_expire_enabled = patch.autoExpireEnabled;
  if (patch.runCycle !== undefined) payload.run_cycle = patch.runCycle;
  if (patch.adminMemo !== undefined) payload.admin_memo = patch.adminMemo;

  const { data, error } = await sb
    .from("point_expire_policies")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_found");
  return rowToExpirePolicy(data as Record<string, unknown>);
}

export async function getActivePointExpirePolicyDb(
  sb: SupabaseClient
): Promise<PointExpirePolicy | null> {
  const { data, error } = await sb
    .from("point_expire_policies")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToExpirePolicy(data as Record<string, unknown>) : null;
}

/** 소멸 실행 이력 한 쪽 + 정확한 전체 건수 (R7 — 예전 100건 고정 상한 제거). */
export async function listPointExpireExecutionsPage(
  sb: SupabaseClient,
  page: { limit: number; offset: number }
): Promise<{ executions: PointExpireExecution[]; total: number }> {
  const { data, error, count } = await sb
    .from("point_expire_executions")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page.offset, page.offset + page.limit - 1);
  if (error) throw new Error(error.message);
  const executions = (data ?? []).map((r) => rowToExpireExecution(r as Record<string, unknown>));
  return { executions, total: count ?? executions.length };
}

/** 소멸 로그 한 쪽 + 정확한 전체 건수 (R7 — 예전 200건 고정 상한 제거). */
export async function listPointExpireLogsPage(
  sb: SupabaseClient,
  page: { limit: number; offset: number }
): Promise<{ logs: PointExpireLog[]; total: number }> {
  const { data, error, count } = await sb
    .from("point_expire_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page.offset, page.offset + page.limit - 1);
  if (error) throw new Error(error.message);
  const logs = (data ?? []).map((r) => rowToExpireLog(r as Record<string, unknown>));
  return { logs, total: count ?? logs.length };
}

const EXPIRE_SUMMARY_CHUNK = 1000;

/**
 * 소멸 실행 요약 — 전체 실행 횟수(count exact)와 전체 소멸 포인트 합계.
 * 합계는 `expired_point` 한 열만 1,000건씩 끝까지 읽어 더한다 (상한 없음 · DB 집계 함수 신설 없이).
 */
export async function summarizePointExpireExecutions(
  sb: SupabaseClient
): Promise<{ runCount: number; totalExpired: number }> {
  let runCount = 0;
  let totalExpired = 0;
  for (let offset = 0; ; offset += EXPIRE_SUMMARY_CHUNK) {
    const { data, error, count } = await sb
      .from("point_expire_executions")
      .select("expired_point", { count: "exact" })
      .order("id", { ascending: true })
      .range(offset, offset + EXPIRE_SUMMARY_CHUNK - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { expired_point?: unknown }[];
    if (offset === 0) runCount = count ?? rows.length;
    for (const r of rows) totalExpired += Number(r.expired_point ?? 0) || 0;
    if (rows.length < EXPIRE_SUMMARY_CHUNK || offset + rows.length >= runCount) break;
  }
  return { runCount, totalExpired };
}

export interface ExpireSimulationItem {
  userId: string;
  userNickname: string;
  ledgerEntryId: string;
  amount: number;
  expiresAt: string;
  description: string;
}

export interface ExpireSimulationResult {
  asOfDate: string;
  policyId: string;
  policyName: string;
  items: ExpireSimulationItem[];
  totalByUser: Record<string, { total: number; nickname: string }>;
}

async function loadLedgerEntriesForExpire(sb: SupabaseClient): Promise<PointLedgerEntry[]> {
  const { data: rows, error } = await sb
    .from("point_ledger")
    .select(POINT_LEDGER_ROW_SELECT)
    .gt("amount", 0)
    .not("expires_at", "is", null)
    .is("expired_amount", null)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_ledger")) return [];
    throw new Error(error.message);
  }
  const list = rows ?? [];
  const userIds = [...new Set(list.map((r) => String((r as { user_id?: string }).user_id ?? "")))].filter(Boolean);
  const nickById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", userIds);
    for (const p of profiles ?? []) {
      nickById[String(p.id)] = String((p as { nickname?: string }).nickname ?? "");
    }
  }
  return list.map((row) => {
    const rec = row as Record<string, unknown>;
    const uid = String(rec.user_id ?? "");
    const entry = normalizeLedgerRow(rec, uid, nickById[uid] ?? "");
    entry.isExpired = rec.expired_amount != null;
    return entry;
  });
}

export async function simulatePointExpireDb(
  sb: SupabaseClient,
  asOfDate: string
): Promise<ExpireSimulationResult | null> {
  const policy = await getActivePointExpirePolicyDb(sb);
  if (!policy) return null;
  const entries = await loadLedgerEntriesForExpire(sb);
  const runTime = new Date(asOfDate).getTime();
  const items: ExpireSimulationItem[] = [];
  for (const e of entries) {
    if (!isEntryExpirable(e, policy)) continue;
    if (!e.expiresAt || new Date(e.expiresAt).getTime() > runTime) continue;
    items.push({
      userId: e.userId,
      userNickname: e.userNickname,
      ledgerEntryId: e.id,
      amount: e.amount,
      expiresAt: e.expiresAt,
      description: e.description,
    });
  }
  const totalByUser: Record<string, { total: number; nickname: string }> = {};
  for (const i of items) {
    const cur = totalByUser[i.userId];
    if (!cur) totalByUser[i.userId] = { total: i.amount, nickname: i.userNickname };
    else cur.total += i.amount;
  }
  return {
    asOfDate,
    policyId: policy.id,
    policyName: policy.policyName,
    items,
    totalByUser,
  };
}

export type RunPointExpireOutcome =
  | { ok: true; executionIds: string[]; totalExpired: number; skippedUsers: number }
  | { ok: false; error: string };

/**
 * V3-06 (P-17): 소멸 실행 = DB 함수 1번 (`admin_run_point_expire`) — 실행 기록·원장 차감·적립분 만료 표시·
 * 소멸 로그·포인트 처리 로그를 한 트랜잭션으로. 후보·차감 의미는 simulatePointExpireDb 와 같다.
 * 같은 기준일 재실행은 이미 표시된 적립분을 다시 차감하지 않는다.
 */
export async function runPointExpireDb(
  sb: SupabaseClient,
  asOfDate: string,
  actor: { id: string; nickname: string }
): Promise<RunPointExpireOutcome> {
  const { data, error } = await sb.rpc("admin_run_point_expire", {
    p_as_of_date: asOfDate,
    p_actor_id: actor.id,
    p_actor_nickname: actor.nickname,
  });
  if (error) return { ok: false, error: error.message || "rpc_failed" };
  const res = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    executionIds?: unknown;
    totalExpired?: unknown;
    skippedUsers?: unknown;
  };
  if (res.ok !== true) return { ok: false, error: String(res.error || "rpc_failed") };
  return {
    ok: true,
    executionIds: Array.isArray(res.executionIds) ? res.executionIds.map((v) => String(v)) : [],
    totalExpired: Math.trunc(Number(res.totalExpired) || 0),
    skippedUsers: Math.trunc(Number(res.skippedUsers) || 0),
  };
}

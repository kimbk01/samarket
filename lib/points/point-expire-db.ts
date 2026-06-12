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
import { expireUserPointEntries, readUserPointBalance } from "@/lib/points/user-point-ledger";

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

export async function listPointExpireExecutions(
  sb: SupabaseClient,
  limit = 100
): Promise<PointExpireExecution[]> {
  const { data, error } = await sb
    .from("point_expire_executions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToExpireExecution(r as Record<string, unknown>));
}

export async function listPointExpireLogs(sb: SupabaseClient, limit = 200): Promise<PointExpireLog[]> {
  const { data, error } = await sb
    .from("point_expire_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToExpireLog(r as Record<string, unknown>));
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

export async function runPointExpireDb(
  sb: SupabaseClient,
  asOfDate: string,
  actor: { type: "admin" | "system"; id: string; nickname: string }
): Promise<{ executionIds: string[]; totalExpired: number }> {
  const sim = await simulatePointExpireDb(sb, asOfDate);
  if (!sim || sim.items.length === 0) {
    return { executionIds: [], totalExpired: 0 };
  }
  const policy = await getActivePointExpirePolicyDb(sb);
  if (!policy) return { executionIds: [], totalExpired: 0 };

  const userGroups = new Map<string, ExpireSimulationItem[]>();
  for (const i of sim.items) {
    const list = userGroups.get(i.userId) ?? [];
    list.push(i);
    userGroups.set(i.userId, list);
  }

  const executionIds: string[] = [];
  let totalExpired = 0;

  for (const [userId, items] of userGroups) {
    const nickname = items[0]?.userNickname ?? userId;
    const userTotal = items.reduce((s, i) => s + i.amount, 0);
    const balanceBefore = await readUserPointBalance(sb, userId);
    const deduct = Math.min(userTotal, balanceBefore);
    if (deduct < 1) continue;

    const { data: execRow, error: execErr } = await sb
      .from("point_expire_executions")
      .insert({
        execution_date: asOfDate,
        policy_id: policy.id,
        target_user_id: userId,
        target_user_nickname: nickname,
        total_candidate_point: userTotal,
        expired_point: deduct,
        remaining_point: Math.max(0, balanceBefore - deduct),
        execution_status: "success",
      })
      .select("id")
      .single();
    if (execErr) throw new Error(execErr.message);
    const executionId = String((execRow as { id?: string }).id ?? "");

    const expireResult = await expireUserPointEntries(sb, {
      userId,
      totalAmount: deduct,
      executionId,
      description: `포인트 만료 (${policy.policyName})`,
      actorType: actor.type,
      ledgerEntryIds: items.map((i) => ({ id: i.ledgerEntryId, amount: i.amount })),
    });
    if (!expireResult.ok) throw new Error(expireResult.error);

    for (const i of items) {
      const { error: logErr } = await sb.from("point_expire_logs").insert({
        execution_id: executionId,
        ledger_entry_id: i.ledgerEntryId,
        user_id: userId,
        user_nickname: nickname,
        expired_point: i.amount,
        expires_at: i.expiresAt,
        action_type: "expire",
        actor_type: actor.type,
        note: i.description,
      });
      if (logErr) throw new Error(logErr.message);
    }

    const { error: actionErr } = await sb.from("point_action_logs").insert({
      action_type: "expire_points",
      actor_type: actor.type,
      actor_id: actor.id,
      actor_nickname: actor.nickname,
      target_user_id: userId,
      target_user_nickname: nickname,
      related_id: expireResult.ledgerId ?? executionId,
      note: `포인트 만료 -${deduct}P`,
    });
    if (actionErr) throw new Error(actionErr.message);

    executionIds.push(executionId);
    totalExpired += deduct;
  }

  return { executionIds, totalExpired };
}

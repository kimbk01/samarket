import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PointReclaimPolicy,
  PointRewardExecution,
  PointRewardLog,
} from "@/lib/types/point-execution";

function rowToRewardExecution(row: Record<string, unknown>): PointRewardExecution {
  return {
    id: String(row.id ?? ""),
    executionKey: String(row.execution_key ?? ""),
    boardKey: String(row.board_key ?? ""),
    actionType: (String(row.action_type ?? "write") as PointRewardExecution["actionType"]),
    targetId: String(row.target_id ?? ""),
    targetType: (String(row.target_type ?? "post") as PointRewardExecution["targetType"]),
    userId: String(row.user_id ?? ""),
    userNickname: String(row.user_nickname ?? ""),
    userType: (String(row.user_type ?? "free") as PointRewardExecution["userType"]),
    rewardType: (String(row.reward_type ?? "fixed") as PointRewardExecution["rewardType"]),
    basePoint: Number(row.base_point ?? 0),
    appliedMultiplier: Number(row.applied_multiplier ?? 1),
    finalPoint: Number(row.final_point ?? 0),
    capped: Boolean(row.capped),
    cooldownBlocked: Boolean(row.cooldown_blocked),
    duplicateBlocked: Boolean(row.duplicate_blocked),
    status: (String(row.status ?? "blocked") as PointRewardExecution["status"]),
    reason: row.reason ? String(row.reason) : undefined,
    createdAt: String(row.created_at ?? ""),
    reversedAt: row.reversed_at ? String(row.reversed_at) : undefined,
  };
}

function rowToRewardLog(row: Record<string, unknown>): PointRewardLog {
  return {
    id: String(row.id ?? ""),
    executionId: String(row.execution_id ?? ""),
    relatedLedgerId: String(row.related_ledger_id ?? ""),
    actionType: (String(row.action_type ?? "reward") as PointRewardLog["actionType"]),
    boardKey: String(row.board_key ?? ""),
    targetId: String(row.target_id ?? ""),
    targetType: (String(row.target_type ?? "post") as PointRewardLog["targetType"]),
    userId: String(row.user_id ?? ""),
    pointAmount: Number(row.point_amount ?? 0),
    balanceAfter: Number(row.balance_after ?? 0),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

function rowToReclaimPolicy(row: Record<string, unknown>): PointReclaimPolicy {
  return {
    id: String(row.id ?? ""),
    targetType: (String(row.target_type ?? "post") as PointReclaimPolicy["targetType"]),
    triggerType: (String(row.trigger_type ?? "delete") as PointReclaimPolicy["triggerType"]),
    reclaimMode: (String(row.reclaim_mode ?? "full") as PointReclaimPolicy["reclaimMode"]),
    reclaimPercent: Number(row.reclaim_percent ?? 100),
    isActive: Boolean(row.is_active),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export function buildRewardExecutionKey(
  boardKey: string,
  actionType: "write" | "comment",
  targetId: string,
  userId: string
): string {
  return `${boardKey}:${actionType}:${targetId}:${userId}`;
}

export async function getPointRewardExecutionByIdDb(
  sb: SupabaseClient,
  id: string
): Promise<PointRewardExecution | null> {
  const { data, error } = await sb
    .from("point_reward_executions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRewardExecution(data as Record<string, unknown>) : null;
}

export async function listPointRewardLogsByExecutionId(
  sb: SupabaseClient,
  executionId: string
): Promise<PointRewardLog[]> {
  const { data, error } = await sb
    .from("point_reward_logs")
    .select("*")
    .eq("execution_id", executionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToRewardLog(r as Record<string, unknown>));
}

export async function listPointRewardExecutions(
  sb: SupabaseClient,
  limit = 200
): Promise<PointRewardExecution[]> {
  const { data, error } = await sb
    .from("point_reward_executions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToRewardExecution(r as Record<string, unknown>));
}

export async function getPointRewardExecutionByKeyDb(
  sb: SupabaseClient,
  executionKey: string
): Promise<PointRewardExecution | null> {
  const { data, error } = await sb
    .from("point_reward_executions")
    .select("*")
    .eq("execution_key", executionKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRewardExecution(data as Record<string, unknown>) : null;
}

export async function getLastSuccessRewardExecutionForCooldown(
  sb: SupabaseClient,
  userId: string,
  boardKey: string,
  actionType: "write" | "comment"
): Promise<PointRewardExecution | null> {
  const { data, error } = await sb
    .from("point_reward_executions")
    .select("*")
    .eq("user_id", userId)
    .eq("board_key", boardKey)
    .eq("action_type", actionType)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRewardExecution(data as Record<string, unknown>) : null;
}

export async function insertPointRewardExecution(
  sb: SupabaseClient,
  input: Omit<PointRewardExecution, "id"> & { id?: string }
): Promise<PointRewardExecution> {
  const row = {
    id: input.id || undefined,
    execution_key: input.executionKey,
    board_key: input.boardKey,
    action_type: input.actionType,
    target_id: input.targetId,
    target_type: input.targetType,
    user_id: input.userId,
    user_nickname: input.userNickname,
    user_type: input.userType,
    reward_type: input.rewardType,
    base_point: input.basePoint,
    applied_multiplier: input.appliedMultiplier,
    final_point: input.finalPoint,
    capped: input.capped,
    cooldown_blocked: input.cooldownBlocked,
    duplicate_blocked: input.duplicateBlocked,
    status: input.status,
    reason: input.reason ?? null,
    created_at: input.createdAt ?? new Date().toISOString(),
    reversed_at: input.reversedAt ?? null,
  };
  const { data, error } = await sb.from("point_reward_executions").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return rowToRewardExecution(data as Record<string, unknown>);
}

export async function listPointRewardLogs(sb: SupabaseClient, limit = 200): Promise<PointRewardLog[]> {
  const { data, error } = await sb
    .from("point_reward_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToRewardLog(r as Record<string, unknown>));
}

export async function insertPointRewardLog(
  sb: SupabaseClient,
  input: Omit<PointRewardLog, "id">
): Promise<PointRewardLog> {
  const { data, error } = await sb
    .from("point_reward_logs")
    .insert({
      execution_id: input.executionId,
      related_ledger_id: input.relatedLedgerId || null,
      action_type: input.actionType,
      board_key: input.boardKey,
      target_id: input.targetId,
      target_type: input.targetType,
      user_id: input.userId,
      point_amount: input.pointAmount,
      balance_after: input.balanceAfter,
      note: input.note,
      created_at: input.createdAt,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToRewardLog(data as Record<string, unknown>);
}

export async function listPointReclaimPolicies(sb: SupabaseClient): Promise<PointReclaimPolicy[]> {
  const { data, error } = await sb.from("point_reclaim_policies").select("*").order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToReclaimPolicy(r as Record<string, unknown>));
}

export type PointReclaimPolicyPatch = Partial<
  Pick<PointReclaimPolicy, "reclaimMode" | "reclaimPercent" | "isActive">
>;

export async function updatePointReclaimPolicyDb(
  sb: SupabaseClient,
  id: string,
  patch: PointReclaimPolicyPatch
): Promise<PointReclaimPolicy> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.reclaimMode !== undefined) payload.reclaim_mode = patch.reclaimMode;
  if (patch.reclaimPercent !== undefined) payload.reclaim_percent = patch.reclaimPercent;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;

  const { data, error } = await sb
    .from("point_reclaim_policies")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("not_found");
  return rowToReclaimPolicy(data as Record<string, unknown>);
}

export async function getPointReclaimPolicyByTargetAndTriggerDb(
  sb: SupabaseClient,
  targetType: PointReclaimPolicy["targetType"],
  triggerType: PointReclaimPolicy["triggerType"]
): Promise<PointReclaimPolicy | null> {
  const { data, error } = await sb
    .from("point_reclaim_policies")
    .select("*")
    .eq("target_type", targetType)
    .eq("trigger_type", triggerType)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToReclaimPolicy(data as Record<string, unknown>) : null;
}

export async function insertPointActionLogDb(
  sb: SupabaseClient,
  input: {
    actionType: string;
    actorType: string;
    actorId: string;
    actorNickname: string;
    targetUserId: string;
    targetUserNickname: string;
    relatedId: string;
    note: string;
  }
): Promise<void> {
  const { error } = await sb.from("point_action_logs").insert({
    action_type: input.actionType,
    actor_type: input.actorType,
    actor_id: input.actorId,
    actor_nickname: input.actorNickname,
    target_user_id: input.targetUserId,
    target_user_nickname: input.targetUserNickname,
    related_id: input.relatedId,
    note: input.note,
  });
  if (error) throw new Error(error.message);
}

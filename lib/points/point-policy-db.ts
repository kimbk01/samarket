import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BoardPointPolicy,
  PointEventPolicy,
  PointPolicyLog,
  PointPolicyLogActionType,
  PointPolicyLogPolicyType,
  PointProbabilityRule,
} from "@/lib/types/point-policy";

function rowToBoardPolicy(row: Record<string, unknown>): BoardPointPolicy {
  return {
    id: String(row.id ?? ""),
    boardKey: String(row.board_key ?? ""),
    boardName: String(row.board_name ?? ""),
    isActive: Boolean(row.is_active),
    writeRewardType: (String(row.write_reward_type ?? "fixed") as BoardPointPolicy["writeRewardType"]),
    writeFixedPoint: Number(row.write_fixed_point ?? 0),
    writeRandomMin: Number(row.write_random_min ?? 0),
    writeRandomMax: Number(row.write_random_max ?? 0),
    writeCooldownSeconds: Number(row.write_cooldown_seconds ?? 0),
    commentRewardType: (String(row.comment_reward_type ?? "fixed") as BoardPointPolicy["commentRewardType"]),
    commentFixedPoint: Number(row.comment_fixed_point ?? 0),
    commentRandomMin: Number(row.comment_random_min ?? 0),
    commentRandomMax: Number(row.comment_random_max ?? 0),
    commentCooldownSeconds: Number(row.comment_cooldown_seconds ?? 0),
    likeRewardPoint: Number(row.like_reward_point ?? 0),
    reportRewardPoint: Number(row.report_reward_point ?? 0),
    maxFreeUserPointCap: Number(row.max_free_user_point_cap ?? 0),
    eventMultiplierEnabled: Boolean(row.event_multiplier_enabled),
    adminMemo: row.admin_memo ? String(row.admin_memo) : undefined,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function rowToProbabilityRule(row: Record<string, unknown>): PointProbabilityRule {
  return {
    id: String(row.id ?? ""),
    policyId: String(row.policy_id ?? ""),
    targetType: (String(row.target_type ?? "write") as PointProbabilityRule["targetType"]),
    minPoint: Number(row.min_point ?? 0),
    maxPoint: Number(row.max_point ?? 0),
    probabilityPercent: Number(row.probability_percent ?? 0),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function rowToEventPolicy(row: Record<string, unknown>): PointEventPolicy {
  const boards = row.target_boards;
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    isActive: Boolean(row.is_active),
    startAt: String(row.start_at ?? ""),
    endAt: String(row.end_at ?? ""),
    writeMultiplier: Number(row.write_multiplier ?? 1),
    commentMultiplier: Number(row.comment_multiplier ?? 1),
    targetBoards: Array.isArray(boards) ? boards.map(String) : [],
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function rowToPolicyLog(row: Record<string, unknown>): PointPolicyLog {
  return {
    id: String(row.id ?? ""),
    policyType: (String(row.policy_type ?? "board_policy") as PointPolicyLogPolicyType),
    relatedId: String(row.related_id ?? ""),
    actionType: (String(row.action_type ?? "update") as PointPolicyLogActionType),
    adminId: String(row.admin_id ?? ""),
    adminNickname: String(row.admin_nickname ?? ""),
    note: String(row.note ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

export async function listBoardPointPolicies(sb: SupabaseClient): Promise<BoardPointPolicy[]> {
  const { data, error } = await sb.from("board_point_policies").select("*").order("board_key");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToBoardPolicy(r as Record<string, unknown>));
}

export async function getBoardPointPolicyByKey(
  sb: SupabaseClient,
  boardKey: string
): Promise<BoardPointPolicy | null> {
  const { data, error } = await sb
    .from("board_point_policies")
    .select("*")
    .eq("board_key", boardKey.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToBoardPolicy(data as Record<string, unknown>) : null;
}

export async function saveBoardPointPolicyDb(
  sb: SupabaseClient,
  input: Omit<BoardPointPolicy, "updatedAt"> & { updatedAt?: string }
): Promise<BoardPointPolicy> {
  const now = new Date().toISOString();
  const id = input.id?.trim() || `bpp-${Date.now()}`;
  const row = {
    id,
    board_key: input.boardKey,
    board_name: input.boardName,
    is_active: input.isActive,
    write_reward_type: input.writeRewardType,
    write_fixed_point: input.writeFixedPoint,
    write_random_min: input.writeRandomMin,
    write_random_max: input.writeRandomMax,
    write_cooldown_seconds: input.writeCooldownSeconds,
    comment_reward_type: input.commentRewardType,
    comment_fixed_point: input.commentFixedPoint,
    comment_random_min: input.commentRandomMin,
    comment_random_max: input.commentRandomMax,
    comment_cooldown_seconds: input.commentCooldownSeconds,
    like_reward_point: input.likeRewardPoint,
    report_reward_point: input.reportRewardPoint,
    max_free_user_point_cap: input.maxFreeUserPointCap,
    event_multiplier_enabled: input.eventMultiplierEnabled,
    admin_memo: input.adminMemo ?? null,
    updated_at: now,
  };
  const { data, error } = await sb.from("board_point_policies").upsert(row).select("*").single();
  if (error) throw new Error(error.message);
  return rowToBoardPolicy(data as Record<string, unknown>);
}

export async function setBoardPointPolicyActiveDb(
  sb: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<BoardPointPolicy | null> {
  const { data, error } = await sb
    .from("board_point_policies")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToBoardPolicy(data as Record<string, unknown>) : null;
}

export async function listProbabilityRulesByPolicyId(
  sb: SupabaseClient,
  policyId: string
): Promise<PointProbabilityRule[]> {
  const { data, error } = await sb
    .from("point_probability_rules")
    .select("*")
    .eq("policy_id", policyId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToProbabilityRule(r as Record<string, unknown>));
}

export async function saveProbabilityRuleDb(
  sb: SupabaseClient,
  input: PointProbabilityRule
): Promise<PointProbabilityRule> {
  const id = input.id?.trim() || `ppr-${Date.now()}`;
  const row = {
    id,
    policy_id: input.policyId,
    target_type: input.targetType,
    min_point: input.minPoint,
    max_point: input.maxPoint,
    probability_percent: input.probabilityPercent,
    sort_order: input.sortOrder,
  };
  const { data, error } = await sb.from("point_probability_rules").upsert(row).select("*").single();
  if (error) throw new Error(error.message);
  return rowToProbabilityRule(data as Record<string, unknown>);
}

export async function deleteProbabilityRuleDb(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("point_probability_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listPointEventPolicies(sb: SupabaseClient): Promise<PointEventPolicy[]> {
  const { data, error } = await sb
    .from("point_event_policies")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToEventPolicy(r as Record<string, unknown>));
}

export async function getActiveEventPolicyForBoardDb(
  sb: SupabaseClient,
  boardKey: string
): Promise<PointEventPolicy | null> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("point_event_policies")
    .select("*")
    .eq("is_active", true)
    .lte("start_at", now)
    .gte("end_at", now);
  if (error) throw new Error(error.message);
  const match = (data ?? []).find((row) => {
    const boards = (row as { target_boards?: string[] }).target_boards ?? [];
    return boards.includes(boardKey);
  });
  return match ? rowToEventPolicy(match as Record<string, unknown>) : null;
}

export async function savePointEventPolicyDb(
  sb: SupabaseClient,
  input: Omit<PointEventPolicy, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  }
): Promise<PointEventPolicy> {
  const now = new Date().toISOString();
  const row = {
    id: input.id || undefined,
    title: input.title,
    is_active: input.isActive,
    start_at: input.startAt,
    end_at: input.endAt,
    write_multiplier: input.writeMultiplier,
    comment_multiplier: input.commentMultiplier,
    target_boards: input.targetBoards,
    note: input.note,
    created_at: input.createdAt ?? now,
    updated_at: now,
  };
  const { data, error } = await sb.from("point_event_policies").upsert(row).select("*").single();
  if (error) throw new Error(error.message);
  return rowToEventPolicy(data as Record<string, unknown>);
}

export async function setPointEventPolicyActiveDb(
  sb: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<PointEventPolicy | null> {
  const { data, error } = await sb
    .from("point_event_policies")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToEventPolicy(data as Record<string, unknown>) : null;
}

export async function listPointPolicyLogs(sb: SupabaseClient, limit = 100): Promise<PointPolicyLog[]> {
  const { data, error } = await sb
    .from("point_policy_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToPolicyLog(r as Record<string, unknown>));
}

export async function addPointPolicyLogDb(
  sb: SupabaseClient,
  input: {
    policyType: PointPolicyLogPolicyType;
    relatedId: string;
    actionType: PointPolicyLogActionType;
    adminId: string;
    adminNickname: string;
    note: string;
  }
): Promise<PointPolicyLog> {
  const { data, error } = await sb
    .from("point_policy_logs")
    .insert({
      policy_type: input.policyType,
      related_id: input.relatedId,
      action_type: input.actionType,
      admin_id: input.adminId,
      admin_nickname: input.adminNickname,
      note: input.note,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToPolicyLog(data as Record<string, unknown>);
}

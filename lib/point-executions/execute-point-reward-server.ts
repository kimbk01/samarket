import type { SupabaseClient } from "@supabase/supabase-js";
import type { PointRewardExecution } from "@/lib/types/point-execution";
import { computePointRewardSimulation } from "@/lib/point-policies/point-reward-simulate-core";
import {
  getActiveEventPolicyForBoardDb,
  getBoardPointPolicyByKey,
  listProbabilityRulesByPolicyId,
} from "@/lib/points/point-policy-db";
import {
  getLastSuccessRewardExecutionForCooldown,
  getPointRewardExecutionByKeyDb,
  insertPointActionLogDb,
  insertPointRewardExecution,
} from "@/lib/points/point-execution-db";
import { sumUserPointLedger } from "@/lib/points/user-point-ledger";

export interface ExecutePointRewardInput {
  boardKey: string;
  actionType: "write" | "comment";
  targetId: string;
  targetType: "post" | "comment";
  userId: string;
  userNickname: string;
  userType: "free" | "premium";
  /** V3-07: 관리자 실지급 사유 — 원장 설명에 함께 남긴다. */
  reason?: string;
  /**
   * V3-07: 관리자가 확인창에서 다시 입력한 지급 포인트(미리보기 상한).
   * 실제 계산된 지급액이 이 값을 넘으면 지급하지 않고 blocked 로 기록한다.
   */
  confirmedMaxPoint?: number;
}

/**
 * P0-4 — 관리자 실지급 결과.
 * granted = 이번 요청으로 원장 지급됨 · already_processed = 같은 글/댓글이 이미 지급(또는 결정)되어 이번엔 지급 없음
 * · blocked = 정책상 지급 안 함. 「완료」 표시는 granted 일 때만.
 */
export type PointRewardOutcome = "granted" | "already_processed" | "blocked";

export type ExecutePointRewardResult = {
  outcome: PointRewardOutcome;
  execution: PointRewardExecution | null;
  ledgerId: string | null;
};

/** 관리자 실지급 실행 키 — 자동 지급 키(community_post:create:{id})와 분리하되 원장 출처는 같은 글/댓글 1개. */
export function buildAdminRewardExecutionKey(targetType: "post" | "comment", targetId: string): string {
  return `admin_reward:${targetType}:${String(targetId ?? "").trim()}`;
}

/** 지급 대상 글/댓글이 실제로 있고 그 작성자가 지급 대상 회원인지 확인 (가짜 출처 지급 금지). */
export async function verifyRewardTargetOwnedByUser(
  sb: SupabaseClient,
  input: { targetType: "post" | "comment"; targetId: string; userId: string }
): Promise<{ ok: true } | { ok: false; error: "target_not_found" | "target_author_mismatch" | "target_lookup_failed" }> {
  const table = input.targetType === "comment" ? "community_comments" : "community_posts";
  const { data, error } = await sb.from(table).select("id, user_id").eq("id", input.targetId).maybeSingle();
  if (error) return { ok: false, error: "target_lookup_failed" };
  if (!data) return { ok: false, error: "target_not_found" };
  if (String((data as { user_id?: string }).user_id ?? "") !== input.userId) {
    return { ok: false, error: "target_author_mismatch" };
  }
  return { ok: true };
}

async function recordBlocked(
  sb: SupabaseClient,
  input: ExecutePointRewardInput,
  executionKey: string,
  fields: Partial<PointRewardExecution> & { reason: string }
): Promise<PointRewardExecution> {
  return insertPointRewardExecution(sb, {
    executionKey,
    boardKey: input.boardKey,
    actionType: input.actionType,
    targetId: input.targetId,
    targetType: input.targetType,
    userId: input.userId,
    userNickname: input.userNickname,
    userType: input.userType,
    rewardType: fields.rewardType ?? "fixed",
    basePoint: fields.basePoint ?? 0,
    appliedMultiplier: fields.appliedMultiplier ?? 1,
    finalPoint: fields.finalPoint ?? 0,
    capped: fields.capped ?? false,
    cooldownBlocked: fields.cooldownBlocked ?? false,
    duplicateBlocked: fields.duplicateBlocked ?? false,
    status: "blocked",
    reason: fields.reason,
    createdAt: new Date().toISOString(),
  });
}

export async function executePointRewardServer(
  sb: SupabaseClient,
  input: ExecutePointRewardInput
): Promise<ExecutePointRewardResult> {
  const executionKey = buildAdminRewardExecutionKey(input.targetType, input.targetId);
  const blocked = async (fields: Partial<PointRewardExecution> & { reason: string }) => ({
    outcome: "blocked" as const,
    execution: await recordBlocked(sb, input, `${executionKey}:blocked:${Date.now()}`, fields),
    ledgerId: null,
  });

  const existing = await getPointRewardExecutionByKeyDb(sb, executionKey);
  if (existing) {
    return { outcome: "already_processed", execution: existing, ledgerId: null };
  }
  const { data: rewarded, error: rewardedErr } = await sb
    .from("point_ledger")
    .select("id")
    .eq("user_id", input.userId)
    .eq("related_type", "community_reward")
    .eq("related_id", input.targetId)
    .limit(1);
  if (rewardedErr) return blocked({ reason: "원장 조회 실패" });
  if (Array.isArray(rewarded) && rewarded.length > 0) {
    return {
      outcome: "already_processed",
      execution: null,
      ledgerId: String((rewarded[0] as { id?: string }).id ?? "") || null,
    };
  }

  const policy = await getBoardPointPolicyByKey(sb, input.boardKey);
  if (!policy || !policy.isActive) {
    return blocked({ reason: "정책 없음 또는 비활성" });
  }

  const cooldownSeconds =
    input.actionType === "write" ? policy.writeCooldownSeconds : policy.commentCooldownSeconds;
  const lastSuccess = await getLastSuccessRewardExecutionForCooldown(
    sb,
    input.userId,
    input.boardKey,
    input.actionType
  );
  const now = Date.now();
  if (
    cooldownSeconds > 0 &&
    lastSuccess &&
    now - new Date(lastSuccess.createdAt).getTime() < cooldownSeconds * 1000
  ) {
    return blocked({
      cooldownBlocked: true,
      rewardType: input.actionType === "write" ? policy.writeRewardType : policy.commentRewardType,
      reason: `쿨다운 ${cooldownSeconds}초 미경과`,
    });
  }

  const event = await getActiveEventPolicyForBoardDb(sb, input.boardKey);
  const probabilityRules = await listProbabilityRulesByPolicyId(sb, policy.id);
  const summed = await sumUserPointLedger(sb, input.userId);
  if (!summed.ok) {
    return blocked({
      reason: summed.error,
    });
  }
  const currentBalance = summed.sum;
  const sim = computePointRewardSimulation({
    boardKey: input.boardKey,
    actionType: input.actionType,
    userType: input.userType,
    currentPointBalance: currentBalance,
    policy,
    event,
    probabilityRules,
  });

  if (sim.rewardPoint <= 0) {
    return blocked({
      basePoint: sim.basePoint,
      appliedMultiplier: sim.appliedMultiplier,
      capped: sim.capped,
      reason: sim.capped ? "무상 한도 도달" : "보상 0",
    });
  }

  if (
    input.confirmedMaxPoint != null &&
    Number.isFinite(input.confirmedMaxPoint) &&
    sim.rewardPoint > input.confirmedMaxPoint
  ) {
    return blocked({
      basePoint: sim.basePoint,
      appliedMultiplier: sim.appliedMultiplier,
      capped: sim.capped,
      reason: `확인 금액 초과 (계산 ${sim.rewardPoint}P > 확인 ${input.confirmedMaxPoint}P)`,
    });
  }

  const rewardType =
    input.actionType === "write" ? policy.writeRewardType : policy.commentRewardType;
  const description = `${input.actionType === "write" ? "글쓰기" : "댓글"} 보상 (${policy.boardName})${
    input.reason?.trim() ? ` · 관리자 지급 사유: ${input.reason.trim()}` : ""
  }`;

  // P0-4 — 실행 기록·원장·보상 로그·잔액 재투영을 운영 원자 RPC 한 번으로 (TS 지급 후 별도 기록 금지).
  // 같은 글/댓글이 이미 보상됐으면 원장 고유 인덱스로 RPC 전체가 롤백 → 지급도 「완료」 기록도 남지 않는다.
  const { data, error } = await sb.rpc("apply_community_point_reward", {
    p_user_id: input.userId,
    p_execution_key: executionKey,
    p_board_key: input.boardKey,
    p_action_type: input.actionType,
    p_target_id: input.targetId,
    p_target_type: input.targetType,
    p_user_nickname: input.userNickname,
    p_user_type: input.userType,
    p_reward_type: rewardType,
    p_base_point: sim.basePoint,
    p_multiplier: sim.appliedMultiplier,
    p_final_point: sim.rewardPoint,
    p_status: "success",
    p_reason: input.reason?.trim() || null,
    p_policy_snapshot: { source: "admin_point_execution", capped: sim.capped },
    p_description: description,
    p_capped: sim.capped,
    p_cooldown_blocked: false,
    p_duplicate_blocked: false,
  });
  if (error) {
    const dup = String(error.code ?? "") === "23505" || /duplicate key/i.test(error.message ?? "");
    if (dup) return { outcome: "already_processed", execution: null, ledgerId: null };
    return blocked({ basePoint: sim.basePoint, appliedMultiplier: sim.appliedMultiplier, reason: error.message });
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok !== true) {
    return blocked({ basePoint: sim.basePoint, appliedMultiplier: sim.appliedMultiplier, reason: String(row.error ?? "rpc") });
  }
  const execution = await getPointRewardExecutionByKeyDb(sb, executionKey);
  const ledgerId = row.ledger_id != null ? String(row.ledger_id) : null;
  if (row.idempotent === true || String(row.status ?? "") !== "success" || !ledgerId) {
    return { outcome: "already_processed", execution, ledgerId };
  }

  await insertPointActionLogDb(sb, {
    actionType: "community_reward",
    actorType: "admin",
    actorId: "admin",
    actorNickname: "관리자",
    targetUserId: input.userId,
    targetUserNickname: input.userNickname,
    relatedId: String(row.execution_id ?? ""),
    note: `${input.actionType === "write" ? "글쓰기" : "댓글"} 관리자 실지급 +${sim.rewardPoint}P`,
  });

  return { outcome: "granted", execution, ledgerId };
}

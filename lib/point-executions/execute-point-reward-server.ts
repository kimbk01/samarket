import type { SupabaseClient } from "@supabase/supabase-js";
import type { PointRewardExecution } from "@/lib/types/point-execution";
import { computePointRewardSimulation } from "@/lib/point-policies/point-reward-simulate-core";
import {
  getActiveEventPolicyForBoardDb,
  getBoardPointPolicyByKey,
  listProbabilityRulesByPolicyId,
} from "@/lib/points/point-policy-db";
import {
  buildRewardExecutionKey,
  getLastSuccessRewardExecutionForCooldown,
  getPointRewardExecutionByKeyDb,
  insertPointActionLogDb,
  insertPointRewardExecution,
  insertPointRewardLog,
} from "@/lib/points/point-execution-db";
import { getActivePointExpirePolicyDb } from "@/lib/points/point-expire-db";
import { computeExpiresAt, isEntryTypeExcluded } from "@/lib/points/point-expire-utils";
import { creditUserPoints, readUserPointBalance } from "@/lib/points/user-point-ledger";

export interface ExecutePointRewardInput {
  boardKey: string;
  actionType: "write" | "comment";
  targetId: string;
  targetType: "post" | "comment";
  userId: string;
  userNickname: string;
  userType: "free" | "premium";
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
): Promise<PointRewardExecution> {
  const executionKey = buildRewardExecutionKey(
    input.boardKey,
    input.actionType,
    input.targetId,
    input.userId
  );

  const existing = await getPointRewardExecutionByKeyDb(sb, executionKey);
  if (existing) {
    return recordBlocked(sb, input, executionKey, {
      duplicateBlocked: true,
      reason: "중복 지급 방지",
    });
  }

  const policy = await getBoardPointPolicyByKey(sb, input.boardKey);
  if (!policy || !policy.isActive) {
    return recordBlocked(sb, input, executionKey, { reason: "정책 없음 또는 비활성" });
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
    return recordBlocked(sb, input, executionKey, {
      cooldownBlocked: true,
      rewardType: input.actionType === "write" ? policy.writeRewardType : policy.commentRewardType,
      reason: `쿨다운 ${cooldownSeconds}초 미경과`,
    });
  }

  const event = await getActiveEventPolicyForBoardDb(sb, input.boardKey);
  const probabilityRules = await listProbabilityRulesByPolicyId(sb, policy.id);
  const currentBalance = await readUserPointBalance(sb, input.userId);
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
    return recordBlocked(sb, input, executionKey, {
      basePoint: sim.basePoint,
      appliedMultiplier: sim.appliedMultiplier,
      capped: sim.capped,
      reason: sim.capped ? "무상 한도 도달" : "보상 0",
    });
  }

  const rewardType =
    input.actionType === "write" ? policy.writeRewardType : policy.commentRewardType;
  const expirePolicy = await getActivePointExpirePolicyDb(sb);
  const nowIso = new Date().toISOString();
  const withExpire =
    expirePolicy && !isEntryTypeExcluded("reward", expirePolicy.excludeEntryTypes);

  const credit = await creditUserPoints(sb, {
    userId: input.userId,
    amount: sim.rewardPoint,
    entryType: "reward",
    relatedType: "community_reward",
    relatedId: input.targetId,
    description: `${input.actionType === "write" ? "글쓰기" : "댓글"} 보상 (${policy.boardName})`,
    actorType: "system",
    earnedAt: withExpire ? nowIso : undefined,
    expiresAt: withExpire ? computeExpiresAt(nowIso, expirePolicy.expireAfterDays) : undefined,
  });
  if (!credit.ok) {
    return recordBlocked(sb, input, executionKey, {
      basePoint: sim.basePoint,
      appliedMultiplier: sim.appliedMultiplier,
      reason: credit.error,
    });
  }

  const execution = await insertPointRewardExecution(sb, {
    executionKey,
    boardKey: input.boardKey,
    actionType: input.actionType,
    targetId: input.targetId,
    targetType: input.targetType,
    userId: input.userId,
    userNickname: input.userNickname,
    userType: input.userType,
    rewardType,
    basePoint: sim.basePoint,
    appliedMultiplier: sim.appliedMultiplier,
    finalPoint: sim.rewardPoint,
    capped: sim.capped,
    cooldownBlocked: false,
    duplicateBlocked: false,
    status: "success",
    createdAt: nowIso,
  });

  await insertPointActionLogDb(sb, {
    actionType: "community_reward",
    actorType: "system",
    actorId: "system",
    actorNickname: "시스템",
    targetUserId: input.userId,
    targetUserNickname: input.userNickname,
    relatedId: execution.id,
    note: `${input.actionType === "write" ? "글쓰기" : "댓글"} 포인트 지급 +${sim.rewardPoint}P`,
  });

  await insertPointRewardLog(sb, {
    executionId: execution.id,
    relatedLedgerId: credit.ledgerId ?? "",
    actionType: "reward",
    boardKey: input.boardKey,
    targetId: input.targetId,
    targetType: input.targetType,
    userId: input.userId,
    pointAmount: sim.rewardPoint,
    balanceAfter: credit.balanceAfter,
    note: `${input.actionType === "write" ? "글쓰기" : "댓글"} 보상`,
    createdAt: nowIso,
  });

  return execution;
}

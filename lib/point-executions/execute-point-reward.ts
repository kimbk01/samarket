/**
 * 25단계: 게시글/댓글 작성 시 포인트 자동 지급 실행 (mock)
 */

import type { PointRewardExecution } from "@/lib/types/point-execution";
import { getBoardPointPolicyByKey } from "@/lib/point-policies/mock-board-point-policies";
import { simulatePointReward } from "@/lib/point-policies/point-reward-simulate";
import { appendPointLedger } from "@/lib/points/mock-point-ledger";
import { addPointActionLog } from "@/lib/points/mock-point-action-logs";
import { getActivePointExpirePolicy } from "@/lib/points/mock-point-expire-policies";
import { computeExpiresAt } from "@/lib/points/point-expire-utils";
import { isEntryTypeExcluded } from "@/lib/points/point-expire-utils";
import { getUserPointBalance } from "@/lib/admin-users/mock-admin-users";
import {
  buildExecutionKey,
  getPointRewardExecutionByKey,
  getLastSuccessExecutionForCooldown,
  addPointRewardExecution,
} from "./mock-point-reward-executions";
import { addPointRewardLog } from "./mock-point-reward-logs";

export interface ExecutePointRewardInput {
  boardKey: string;
  actionType: "write" | "comment";
  targetId: string;
  targetType: "post" | "comment";
  userId: string;
  userNickname: string;
  userType: "free" | "premium";
}

/**
 * 게시글 작성 또는 댓글 작성 시 포인트 지급 실행.
 * 중복/쿨다운/상한 시 차단 처리하고 실행 이력만 기록.
 */
export function executePointReward(
  input: ExecutePointRewardInput
): PointRewardExecution {
  const {
    boardKey,
    actionType,
    targetId,
    targetType,
    userId,
    userNickname,
    userType,
  } = input;
  const executionKey = buildExecutionKey(boardKey, actionType, targetId, userId);

  const existing = getPointRewardExecutionByKey(executionKey);
  if (existing) {
    const blocked: PointRewardExecution = {
      ...existing,
      id: "",
      duplicateBlocked: true,
      cooldownBlocked: false,
      capped: false,
      status: "blocked",
      reason: "중복 지급 방지",
      basePoint: 0,
      appliedMultiplier: 1,
      finalPoint: 0,
      rewardType: "fixed",
      createdAt: new Date().toISOString(),
    };
    const recorded = addPointRewardExecution({
      ...blocked,
      executionKey,
      boardKey,
      actionType,
      targetId,
      targetType,
      userId,
      userNickname,
      userType,
    });
    return { ...recorded };
  }

  const policy = getBoardPointPolicyByKey(boardKey);
  if (!policy || !policy.isActive) {
    const blocked = addPointRewardExecution({
      executionKey,
      boardKey,
      actionType,
      targetId,
      targetType,
      userId,
      userNickname,
      userType,
      rewardType: "fixed",
      basePoint: 0,
      appliedMultiplier: 1,
      finalPoint: 0,
      capped: false,
      cooldownBlocked: false,
      duplicateBlocked: false,
      status: "blocked",
      reason: "정책 없음 또는 비활성",
      createdAt: new Date().toISOString(),
    });
    return { ...blocked };
  }

  const cooldownSeconds =
    actionType === "write"
      ? policy.writeCooldownSeconds
      : policy.commentCooldownSeconds;
  const lastSuccess = getLastSuccessExecutionForCooldown(
    userId,
    boardKey,
    actionType
  );
  const now = Date.now();
  if (
    cooldownSeconds > 0 &&
    lastSuccess &&
    now - new Date(lastSuccess.createdAt).getTime() < cooldownSeconds * 1000
  ) {
    const blocked = addPointRewardExecution({
      executionKey,
      boardKey,
      actionType,
      targetId,
      targetType,
      userId,
      userNickname,
      userType,
      rewardType:
        actionType === "write" ? policy.writeRewardType : policy.commentRewardType,
      basePoint: 0,
      appliedMultiplier: 1,
      finalPoint: 0,
      capped: false,
      cooldownBlocked: true,
      duplicateBlocked: false,
      status: "blocked",
      reason: `쿨다운 ${cooldownSeconds}초 미경과`,
      createdAt: new Date().toISOString(),
    });
    return { ...blocked };
  }

  const currentBalance = getUserPointBalance(userId);
  const sim = simulatePointReward(
    boardKey,
    actionType,
    userType,
    currentBalance
  );

  if (sim.rewardPoint <= 0) {
    const blocked = addPointRewardExecution({
      executionKey,
      boardKey,
      actionType,
      targetId,
      targetType,
      userId,
      userNickname,
      userType,
      rewardType: "fixed",
      basePoint: sim.basePoint,
      appliedMultiplier: sim.appliedMultiplier,
      finalPoint: 0,
      capped: sim.capped,
      cooldownBlocked: false,
      duplicateBlocked: false,
      status: "blocked",
      reason: sim.capped ? "무상 한도 도달" : "보상 0",
      createdAt: new Date().toISOString(),
    });
    return { ...blocked };
  }

  const rewardType =
    actionType === "write" ? policy.writeRewardType : policy.commentRewardType;
  const expirePolicy = getActivePointExpirePolicy();
  const nowIso = new Date().toISOString();
  const expireOptions =
    expirePolicy &&
    !isEntryTypeExcluded("reward", expirePolicy.excludeEntryTypes)
      ? {
          earnedAt: nowIso,
          expiresAt: computeExpiresAt(nowIso, expirePolicy.expireAfterDays),
        }
      : undefined;
  const entry = appendPointLedger(
    userId,
    userNickname,
    "reward",
    sim.rewardPoint,
    "community_reward",
    targetId,
    `${actionType === "write" ? "글쓰기" : "댓글"} 보상 (${policy.boardName})`,
    "system",
    expireOptions
  );

  const execution = addPointRewardExecution({
    executionKey,
    boardKey,
    actionType,
    targetId,
    targetType,
    userId,
    userNickname,
    userType,
    rewardType,
    basePoint: sim.basePoint,
    appliedMultiplier: sim.appliedMultiplier,
    finalPoint: sim.rewardPoint,
    capped: sim.capped,
    cooldownBlocked: false,
    duplicateBlocked: false,
    status: "success",
    createdAt: new Date().toISOString(),
  });

  addPointActionLog(
    "community_reward",
    "system",
    "system",
    "시스템",
    userId,
    userNickname,
    execution.id,
    `${actionType === "write" ? "글쓰기" : "댓글"} 포인트 지급 +${sim.rewardPoint}P`
  );

  addPointRewardLog({
    executionId: execution.id,
    relatedLedgerId: entry.id,
    actionType: "reward",
    boardKey,
    targetId,
    targetType,
    userId,
    pointAmount: sim.rewardPoint,
    balanceAfter: entry.balanceAfter,
    note: `${actionType === "write" ? "글쓰기" : "댓글"} 보상`,
    createdAt: new Date().toISOString(),
  });

  return { ...execution };
}

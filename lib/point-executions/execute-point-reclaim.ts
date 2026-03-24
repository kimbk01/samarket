/**
 * 25단계: 게시글/댓글 삭제 시 포인트 회수 실행 (mock)
 */

import type { PointReclaimTriggerType } from "@/lib/types/point-execution";
import { appendPointLedger } from "@/lib/points/mock-point-ledger";
import { addPointActionLog } from "@/lib/points/mock-point-action-logs";
import {
  getPointRewardExecutionsByTargetId,
  setPointRewardExecutionReversed,
} from "./mock-point-reward-executions";
import { getPointReclaimPolicyByTargetAndTrigger } from "./mock-point-reclaim-policies";
import { addPointRewardLog } from "./mock-point-reward-logs";

export interface ExecutePointReclaimInput {
  targetId: string;
  targetType: "post" | "comment";
  triggerType: PointReclaimTriggerType;
}

/**
 * 삭제/관리자삭제/신고적중 시 해당 타겟에 대한 기존 지급 포인트 회수.
 * 회수 정책이 없거나 해당 실행이 없으면 스킵.
 */
export function executePointReclaim(input: ExecutePointReclaimInput): void {
  const { targetId, targetType, triggerType } = input;
  const policy = getPointReclaimPolicyByTargetAndTrigger(
    targetType,
    triggerType
  );
  if (!policy || !policy.isActive) return;

  const executions = getPointRewardExecutionsByTargetId(targetId).filter(
    (e) => e.targetType === targetType
  );
  if (executions.length === 0) return;

  const execution = executions[0];
  if (execution.status !== "success" || execution.finalPoint <= 0) return;

  const reclaimAmount =
    policy.reclaimMode === "full"
      ? execution.finalPoint
      : Math.round(
          (execution.finalPoint * policy.reclaimPercent) / 100
        );

  if (reclaimAmount <= 0) return;

  const entry = appendPointLedger(
    execution.userId,
    execution.userNickname,
    "reverse",
    reclaimAmount,
    "community_reclaim",
    execution.id,
    `${targetType === "post" ? "글" : "댓글"} 삭제로 인한 포인트 회수`,
    "system"
  );

  setPointRewardExecutionReversed(
    execution.id,
    new Date().toISOString()
  );

  addPointActionLog(
    "community_reclaim",
    "system",
    "시스템",
    "시스템",
    execution.userId,
    execution.userNickname,
    execution.id,
    `포인트 회수 -${reclaimAmount}P (${targetType} ${targetId})`
  );

  addPointRewardLog({
    executionId: execution.id,
    relatedLedgerId: entry.id,
    actionType: "reclaim",
    boardKey: execution.boardKey,
    targetId,
    targetType,
    userId: execution.userId,
    pointAmount: -reclaimAmount,
    balanceAfter: entry.balanceAfter,
    note: `${targetType} 삭제 회수`,
    createdAt: new Date().toISOString(),
  });
}

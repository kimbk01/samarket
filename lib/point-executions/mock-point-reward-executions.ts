/**
 * 25단계: 포인트 지급 실행 mock
 */

import type { PointRewardExecution } from "@/lib/types/point-execution";

const EXECUTIONS: PointRewardExecution[] = [
  {
    id: "pre-1",
    executionKey: "general:write:post-1:user-a",
    boardKey: "general",
    actionType: "write",
    targetId: "post-1",
    targetType: "post",
    userId: "user-a",
    userNickname: "글쓴이A",
    userType: "free",
    rewardType: "fixed",
    basePoint: 5,
    appliedMultiplier: 1.5,
    finalPoint: 7,
    capped: false,
    cooldownBlocked: false,
    duplicateBlocked: false,
    status: "success",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "pre-2",
    executionKey: "general:comment:comment-1:user-b",
    boardKey: "general",
    actionType: "comment",
    targetId: "comment-1",
    targetType: "comment",
    userId: "user-b",
    userNickname: "댓글러B",
    userType: "free",
    rewardType: "fixed",
    basePoint: 2,
    appliedMultiplier: 1,
    finalPoint: 2,
    capped: false,
    cooldownBlocked: false,
    duplicateBlocked: false,
    status: "success",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

function nextId(): string {
  const nums = EXECUTIONS.map((e) =>
    parseInt(e.id.replace("pre-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `pre-${max + 1}`;
}

export function buildExecutionKey(
  boardKey: string,
  actionType: "write" | "comment",
  targetId: string,
  userId: string
): string {
  return `${boardKey}:${actionType}:${targetId}:${userId}`;
}

export function getPointRewardExecutions(): PointRewardExecution[] {
  return [...EXECUTIONS].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getPointRewardExecutionById(
  id: string
): PointRewardExecution | undefined {
  return EXECUTIONS.find((e) => e.id === id);
}

export function getPointRewardExecutionByKey(
  executionKey: string
): PointRewardExecution | undefined {
  return EXECUTIONS.find((e) => e.executionKey === executionKey);
}

export function getPointRewardExecutionsByTargetId(
  targetId: string
): PointRewardExecution[] {
  return EXECUTIONS.filter((e) => e.targetId === targetId && e.status === "success");
}

export function getLastSuccessExecutionForCooldown(
  userId: string,
  boardKey: string,
  actionType: "write" | "comment"
): PointRewardExecution | undefined {
  return [...EXECUTIONS]
    .filter(
      (e) =>
        e.userId === userId &&
        e.boardKey === boardKey &&
        e.actionType === actionType &&
        e.status === "success"
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
}

export function addPointRewardExecution(
  execution: Omit<PointRewardExecution, "id">
): PointRewardExecution {
  const withId: PointRewardExecution = {
    ...execution,
    id: nextId(),
  };
  EXECUTIONS.push(withId);
  return { ...withId };
}

export function setPointRewardExecutionReversed(
  id: string,
  reversedAt: string
): PointRewardExecution | undefined {
  const e = EXECUTIONS.find((x) => x.id === id);
  if (!e) return undefined;
  e.status = "reversed";
  e.reversedAt = reversedAt;
  return { ...e };
}

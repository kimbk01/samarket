/**
 * 25단계: 포인트 지급/회수 로그 mock
 */

import type { PointRewardLog } from "@/lib/types/point-execution";

const LOGS: PointRewardLog[] = [
  {
    id: "prl-1",
    executionId: "pre-1",
    relatedLedgerId: "ple-reward-1",
    actionType: "reward",
    boardKey: "general",
    targetId: "post-1",
    targetType: "post",
    userId: "user-a",
    pointAmount: 7,
    balanceAfter: 5257,
    note: "글쓰기 보상 (고정 5P × 1.5 배율)",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "prl-2",
    executionId: "pre-2",
    relatedLedgerId: "ple-reward-2",
    actionType: "reward",
    boardKey: "general",
    targetId: "comment-1",
    targetType: "comment",
    userId: "user-b",
    pointAmount: 2,
    balanceAfter: 1002,
    note: "댓글 보상 (고정 2P)",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
];

function nextId(): string {
  const nums = LOGS.map((l) =>
    parseInt(l.id.replace("prl-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `prl-${max + 1}`;
}

export function getPointRewardLogs(): PointRewardLog[] {
  return [...LOGS].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getPointRewardLogsByExecutionId(
  executionId: string
): PointRewardLog[] {
  return LOGS.filter((l) => l.executionId === executionId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((l) => ({ ...l }));
}

export function addPointRewardLog(
  log: Omit<PointRewardLog, "id">
): PointRewardLog {
  const withId: PointRewardLog = { ...log, id: nextId() };
  LOGS.push(withId);
  return { ...withId };
}

/**
 * 26단계: 포인트 만료 실행 mock
 */

import type { PointExpireExecution } from "@/lib/types/point-expire";

const EXECUTIONS: PointExpireExecution[] = [
  {
    id: "pex-1",
    executionDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    policyId: "pep-1",
    targetUserId: "user-a",
    targetUserNickname: "테스트유저",
    totalCandidatePoint: 10,
    expiredPoint: 10,
    remainingPoint: 0,
    executionStatus: "success",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

function nextId(): string {
  const nums = EXECUTIONS.map((e) =>
    parseInt(e.id.replace("pex-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `pex-${max + 1}`;
}

export function getPointExpireExecutions(): PointExpireExecution[] {
  return [...EXECUTIONS].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addPointExpireExecution(
  execution: Omit<PointExpireExecution, "id">
): PointExpireExecution {
  const withId: PointExpireExecution = { ...execution, id: nextId() };
  EXECUTIONS.push(withId);
  return { ...withId };
}

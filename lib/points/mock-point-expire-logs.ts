/**
 * 26단계: 포인트 만료 로그 mock
 */

import type { PointExpireLog } from "@/lib/types/point-expire";

const LOGS: PointExpireLog[] = [
  {
    id: "pel-1",
    executionId: "pex-1",
    ledgerEntryId: "ple-reward-1",
    userId: "user-a",
    userNickname: "테스트유저",
    expiredPoint: 7,
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
    actionType: "expire",
    actorType: "system",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    note: "글쓰기 보상 만료",
  },
];

function nextId(): string {
  const nums = LOGS.map((l) =>
    parseInt(l.id.replace("pel-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `pel-${max + 1}`;
}

export function getPointExpireLogs(): PointExpireLog[] {
  return [...LOGS].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getPointExpireLogsByExecutionId(
  executionId: string
): PointExpireLog[] {
  return LOGS.filter((l) => l.executionId === executionId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((l) => ({ ...l }));
}

export function getPointExpireLogsByUserId(userId: string): PointExpireLog[] {
  return LOGS.filter((l) => l.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((l) => ({ ...l }));
}

export function addPointExpireLog(
  log: Omit<PointExpireLog, "id">
): PointExpireLog {
  const withId: PointExpireLog = { ...log, id: nextId() };
  LOGS.push(withId);
  return { ...withId };
}

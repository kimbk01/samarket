/**
 * 23단계: 포인트 액션 로그 mock
 */

import type { PointActionLog, PointActionLogType } from "@/lib/types/point";

const LOGS: PointActionLog[] = [];

function nextId(): string {
  const nums = LOGS.map((l) =>
    parseInt(l.id.replace("pal-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `pal-${max + 1}`;
}

export function addPointActionLog(
  actionType: PointActionLogType,
  actorType: "user" | "admin" | "system",
  actorId: string,
  actorNickname: string,
  targetUserId: string,
  targetUserNickname: string,
  relatedId: string,
  note: string
): void {
  LOGS.push({
    id: nextId(),
    actionType,
    actorType,
    actorId,
    actorNickname,
    targetUserId,
    targetUserNickname,
    relatedId,
    note,
    createdAt: new Date().toISOString(),
  });
}

export function getPointActionLogsByUserId(
  userId: string
): PointActionLog[] {
  return LOGS.filter((l) => l.targetUserId === userId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((l) => ({ ...l }));
}

export function getPointActionLogsByRelatedId(
  relatedId: string
): PointActionLog[] {
  return LOGS.filter((l) => l.relatedId === relatedId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((l) => ({ ...l }));
}

export function getPointActionLogsForAdmin(): PointActionLog[] {
  return [...LOGS].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

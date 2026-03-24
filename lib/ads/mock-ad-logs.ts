/**
 * 22단계: 광고 신청 변경 이력 mock
 */

import type {
  AdApplicationLog,
  AdLogActionType,
} from "@/lib/types/ad-application";

const LOGS: AdApplicationLog[] = [];

function nextId(): string {
  const nums = LOGS.map((l) =>
    parseInt(l.id.replace("adl-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `adl-${max + 1}`;
}

export function addAdApplicationLog(
  adApplicationId: string,
  actionType: AdLogActionType,
  actorType: "user" | "admin",
  actorId: string,
  actorNickname: string,
  note: string
): void {
  LOGS.push({
    id: nextId(),
    adApplicationId,
    actionType,
    actorType,
    actorId,
    actorNickname,
    note,
    createdAt: new Date().toISOString(),
  });
}

export function getAdApplicationLogs(
  adApplicationId: string
): AdApplicationLog[] {
  return LOGS.filter((l) => l.adApplicationId === adApplicationId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((l) => ({ ...l }));
}

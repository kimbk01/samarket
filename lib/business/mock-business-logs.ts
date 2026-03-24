/**
 * 21단계: 상점 변경 이력 mock
 */

import type {
  BusinessProfileLog,
  BusinessProfileLogActionType,
} from "@/lib/types/business";

const LOGS: BusinessProfileLog[] = [
  {
    id: "bpl-1",
    businessProfileId: "bp-1",
    actionType: "apply",
    adminId: "system",
    adminNickname: "시스템",
    note: "비즈프로필 신청",
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: "bpl-2",
    businessProfileId: "bp-1",
    actionType: "approve",
    adminId: "admin-1",
    adminNickname: "관리자",
    note: "승인",
    createdAt: new Date(Date.now() - 86400000 * 28).toISOString(),
  },
];

function nextId(): string {
  const nums = LOGS.map((l) =>
    parseInt(l.id.replace("bpl-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `bpl-${max + 1}`;
}

export function addBusinessLog(
  businessProfileId: string,
  actionType: BusinessProfileLogActionType,
  adminId: string,
  adminNickname: string,
  note: string
): void {
  LOGS.push({
    id: nextId(),
    businessProfileId,
    actionType,
    adminId,
    adminNickname,
    note,
    createdAt: new Date().toISOString(),
  });
}

export function getBusinessProfileLogs(
  businessProfileId: string
): BusinessProfileLog[] {
  return LOGS.filter((l) => l.businessProfileId === businessProfileId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((l) => ({ ...l }));
}

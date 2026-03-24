/**
 * 28단계: 노출 정책 변경 이력 mock
 */

import type {
  ExposurePolicyLog,
  ExposurePolicyLogActionType,
  ExposureSurface,
} from "@/lib/types/exposure";

const LOGS: ExposurePolicyLog[] = [
  {
    id: "epl-1",
    policyId: "esp-home",
    surface: "home",
    actionType: "create",
    adminId: "admin-1",
    adminNickname: "관리자",
    note: "홈 정책 생성",
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

function nextId(): string {
  const nums = LOGS.map((l) =>
    parseInt(l.id.replace("epl-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `epl-${max + 1}`;
}

export function getExposurePolicyLogs(): ExposurePolicyLog[] {
  return [...LOGS].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addExposurePolicyLog(
  policyId: string,
  surface: ExposureSurface,
  actionType: ExposurePolicyLogActionType,
  note: string,
  adminId = "admin-1",
  adminNickname = "관리자"
): ExposurePolicyLog {
  const log: ExposurePolicyLog = {
    id: nextId(),
    policyId,
    surface,
    actionType,
    adminId,
    adminNickname,
    note,
    createdAt: new Date().toISOString(),
  };
  LOGS.push(log);
  return { ...log };
}

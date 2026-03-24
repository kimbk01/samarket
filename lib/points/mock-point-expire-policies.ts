/**
 * 26단계: 포인트 만료 정책 mock
 */

import type { PointExpirePolicy } from "@/lib/types/point-expire";

const POLICIES: PointExpirePolicy[] = [
  {
    id: "pep-1",
    policyName: "기본 만료 정책",
    isActive: true,
    expireAfterDays: 365,
    excludeEntryTypes: ["charge", "admin_adjust"],
    allowUserView: true,
    autoExpireEnabled: true,
    runCycle: "daily",
    updatedAt: new Date().toISOString(),
    adminMemo: "충전·관리자조정 제외, 365일 후 만료",
  },
];

function nextId(): string {
  const nums = POLICIES.map((p) =>
    parseInt(p.id.replace("pep-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `pep-${max + 1}`;
}

export function getPointExpirePolicies(): PointExpirePolicy[] {
  return [...POLICIES];
}

export function getActivePointExpirePolicy(): PointExpirePolicy | undefined {
  return POLICIES.find((p) => p.isActive);
}

export function getPointExpirePolicyById(id: string): PointExpirePolicy | undefined {
  return POLICIES.find((p) => p.id === id);
}

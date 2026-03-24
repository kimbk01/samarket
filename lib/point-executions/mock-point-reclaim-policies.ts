/**
 * 25단계: 포인트 회수 정책 mock
 */

import type {
  PointReclaimPolicy,
  PointReclaimTargetType,
  PointReclaimTriggerType,
} from "@/lib/types/point-execution";

const POLICIES: PointReclaimPolicy[] = [
  {
    id: "prp-1",
    targetType: "post",
    triggerType: "delete",
    reclaimMode: "full",
    reclaimPercent: 100,
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prp-2",
    targetType: "comment",
    triggerType: "delete",
    reclaimMode: "full",
    reclaimPercent: 100,
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "prp-3",
    targetType: "post",
    triggerType: "report_confirmed",
    reclaimMode: "full",
    reclaimPercent: 100,
    isActive: true,
    updatedAt: new Date().toISOString(),
  },
];

function nextId(): string {
  const nums = POLICIES.map((p) =>
    parseInt(p.id.replace("prp-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `prp-${max + 1}`;
}

export function getPointReclaimPolicies(): PointReclaimPolicy[] {
  return [...POLICIES];
}

export function getPointReclaimPolicyByTargetAndTrigger(
  targetType: PointReclaimTargetType,
  triggerType: PointReclaimTriggerType
): PointReclaimPolicy | undefined {
  return POLICIES.find(
    (p) =>
      p.targetType === targetType &&
      p.triggerType === triggerType &&
      p.isActive
  );
}

export function getPointReclaimPolicyById(
  id: string
): PointReclaimPolicy | undefined {
  return POLICIES.find((p) => p.id === id);
}

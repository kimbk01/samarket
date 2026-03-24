/**
 * 24단계: 확률형 포인트 구간 mock
 */

import type {
  PointProbabilityRule,
  PointProbabilityTargetType,
} from "@/lib/types/point-policy";
import { addPointPolicyLog } from "./mock-point-policy-logs";

const RULES: PointProbabilityRule[] = [
  {
    id: "ppr-1",
    policyId: "bpp-2",
    targetType: "write",
    minPoint: 3,
    maxPoint: 5,
    probabilityPercent: 60,
    sortOrder: 1,
  },
  {
    id: "ppr-2",
    policyId: "bpp-2",
    targetType: "write",
    minPoint: 6,
    maxPoint: 10,
    probabilityPercent: 40,
    sortOrder: 2,
  },
];

function nextId(): string {
  const nums = RULES.map((r) =>
    parseInt(r.id.replace("ppr-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `ppr-${max + 1}`;
}

export function getPointProbabilityRulesByPolicyId(
  policyId: string
): PointProbabilityRule[] {
  return RULES.filter((r) => r.policyId === policyId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => ({ ...r }));
}

export function getPointProbabilityRules(): PointProbabilityRule[] {
  return RULES.map((r) => ({ ...r }));
}

export function savePointProbabilityRule(
  input: Omit<PointProbabilityRule, "id"> & { id?: string }
): PointProbabilityRule {
  const existing = input.id ? RULES.find((r) => r.id === input.id) : null;
  if (existing) {
    Object.assign(existing, input);
    addPointPolicyLog(
      "probability_rule",
      existing.id,
      "update",
      "확률 구간 수정"
    );
    return { ...existing };
  }
  const rule: PointProbabilityRule = {
    ...input,
    id: nextId(),
  };
  RULES.push(rule);
  addPointPolicyLog(
    "probability_rule",
    rule.id,
    "create",
    "확률 구간 추가"
  );
  return { ...rule };
}

export function deletePointProbabilityRule(id: string): boolean {
  const idx = RULES.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  RULES.splice(idx, 1);
  return true;
}

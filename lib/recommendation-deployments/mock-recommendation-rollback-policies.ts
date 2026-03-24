/**
 * 33단계: 롤백 정책 mock (자동 롤백 조건 placeholder)
 */

import type { RecommendationRollbackPolicy } from "@/lib/types/recommendation-deployment";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const POLICIES: RecommendationRollbackPolicy[] = [
  {
    id: "rrp-home",
    surface: "home",
    autoRollbackEnabled: false,
    minCtrThreshold: 0.01,
    minConversionRateThreshold: 0.05,
    maxErrorRateThreshold: 0.1,
    compareWindowHours: 24,
    updatedAt: new Date().toISOString(),
    adminMemo: "placeholder",
  },
  {
    id: "rrp-search",
    surface: "search",
    autoRollbackEnabled: false,
    minCtrThreshold: 0.01,
    minConversionRateThreshold: 0.05,
    maxErrorRateThreshold: 0.1,
    compareWindowHours: 24,
    updatedAt: new Date().toISOString(),
    adminMemo: "placeholder",
  },
  {
    id: "rrp-shop",
    surface: "shop",
    autoRollbackEnabled: false,
    minCtrThreshold: 0.01,
    minConversionRateThreshold: 0.05,
    maxErrorRateThreshold: 0.1,
    compareWindowHours: 24,
    updatedAt: new Date().toISOString(),
    adminMemo: "placeholder",
  },
];

export function getRollbackPolicies(
  surface?: RecommendationSurface
): RecommendationRollbackPolicy[] {
  if (surface) return POLICIES.filter((p) => p.surface === surface);
  return [...POLICIES];
}

export function getRollbackPolicyBySurface(
  surface: RecommendationSurface
): RecommendationRollbackPolicy | undefined {
  return POLICIES.find((p) => p.surface === surface);
}

export function saveRollbackPolicy(
  input: Partial<RecommendationRollbackPolicy> & {
    id: string;
    surface: RecommendationSurface;
  }
): RecommendationRollbackPolicy {
  const now = new Date().toISOString();
  const existing = POLICIES.find((p) => p.id === input.id || p.surface === input.surface);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: RecommendationRollbackPolicy = {
    id: input.id,
    surface: input.surface,
    autoRollbackEnabled: input.autoRollbackEnabled ?? false,
    minCtrThreshold: input.minCtrThreshold ?? 0,
    minConversionRateThreshold: input.minConversionRateThreshold ?? 0,
    maxErrorRateThreshold: input.maxErrorRateThreshold ?? 0,
    compareWindowHours: input.compareWindowHours ?? 24,
    updatedAt: now,
    adminMemo: input.adminMemo ?? "",
  };
  POLICIES.push(policy);
  return policy;
}

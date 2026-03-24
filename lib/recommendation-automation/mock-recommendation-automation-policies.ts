/**
 * 36단계: 운영 자동화 정책 mock
 */

import type { RecommendationAutomationPolicy } from "@/lib/types/recommendation-automation";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const now = new Date().toISOString();

const POLICIES: RecommendationAutomationPolicy[] = (
  ["home", "search", "shop"] as RecommendationSurface[]
).map((surface) => ({
  id: `rap-${surface}`,
  surface,
  isActive: surface === "home",
  autoFallbackEnabled: true,
  autoKillSwitchEnabled: false,
  autoRollbackEnabled: true,
  autoRecoveryEnabled: true,
  dryRunEnabled: false,
  emptyFeedRateThreshold: 0.15,
  successRateThreshold: 0.92,
  ctrDropThreshold: 0.3,
  conversionDropThreshold: 0.25,
  deploymentFailureThreshold: 2,
  compareWindowMinutes: 60,
  fallbackMode: "previous_live_version",
  rollbackTargetMode: "previous_live_version",
  recoveryConditionMode: "auto_when_healthy",
  updatedAt: now,
  adminMemo: "",
}));

export function getRecommendationAutomationPolicies(
  surface?: RecommendationSurface
): RecommendationAutomationPolicy[] {
  if (surface) return POLICIES.filter((p) => p.surface === surface);
  return [...POLICIES];
}

export function getRecommendationAutomationPolicyBySurface(
  surface: RecommendationSurface
): RecommendationAutomationPolicy | undefined {
  return POLICIES.find((p) => p.surface === surface);
}

export function saveRecommendationAutomationPolicy(
  input: Partial<RecommendationAutomationPolicy> & {
    id: string;
    surface: RecommendationSurface;
  }
): RecommendationAutomationPolicy {
  const now = new Date().toISOString();
  const existing = POLICIES.find(
    (p) => p.id === input.id || p.surface === input.surface
  );
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: RecommendationAutomationPolicy = {
    id: input.id,
    surface: input.surface,
    isActive: input.isActive ?? false,
    autoFallbackEnabled: input.autoFallbackEnabled ?? false,
    autoKillSwitchEnabled: input.autoKillSwitchEnabled ?? false,
    autoRollbackEnabled: input.autoRollbackEnabled ?? false,
    autoRecoveryEnabled: input.autoRecoveryEnabled ?? false,
    dryRunEnabled: input.dryRunEnabled ?? false,
    emptyFeedRateThreshold: input.emptyFeedRateThreshold ?? 0,
    successRateThreshold: input.successRateThreshold ?? 0,
    ctrDropThreshold: input.ctrDropThreshold ?? 0,
    conversionDropThreshold: input.conversionDropThreshold ?? 0,
    deploymentFailureThreshold: input.deploymentFailureThreshold ?? 0,
    compareWindowMinutes: input.compareWindowMinutes ?? 60,
    fallbackMode: input.fallbackMode ?? "previous_live_version",
    rollbackTargetMode: input.rollbackTargetMode ?? "previous_live_version",
    recoveryConditionMode: input.recoveryConditionMode ?? "manual_only",
    updatedAt: now,
    adminMemo: input.adminMemo ?? "",
  };
  POLICIES.push(policy);
  return policy;
}

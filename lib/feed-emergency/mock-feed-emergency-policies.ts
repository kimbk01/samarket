/**
 * 34단계: 피드 장애 대응 정책 mock
 */

import type { FeedEmergencyPolicy } from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const now = new Date().toISOString();

const POLICIES: FeedEmergencyPolicy[] = (
  ["home", "search", "shop"] as RecommendationSurface[]
).map((surface) => ({
  id: `fep-${surface}`,
  surface,
  killSwitchEnabled: false,
  fallbackEnabled: true,
  fallbackMode: "previous_live_version" as const,
  autoDisableEnabled: false,
  errorRateThreshold: 0.05,
  emptyFeedThreshold: 3,
  ctrDropThreshold: 0.3,
  emergencyNoticeEnabled: false,
  emergencyNoticeText: "일시적인 점검 중입니다. 잠시만 기다려 주세요.",
  updatedAt: now,
  adminMemo: "",
}));

export function getFeedEmergencyPolicies(
  surface?: RecommendationSurface
): FeedEmergencyPolicy[] {
  if (surface) return POLICIES.filter((p) => p.surface === surface);
  return [...POLICIES];
}

export function getFeedEmergencyPolicyBySurface(
  surface: RecommendationSurface
): FeedEmergencyPolicy | undefined {
  return POLICIES.find((p) => p.surface === surface);
}

export function saveFeedEmergencyPolicy(
  input: Partial<FeedEmergencyPolicy> & {
    id: string;
    surface: RecommendationSurface;
  }
): FeedEmergencyPolicy {
  const now = new Date().toISOString();
  const existing = POLICIES.find(
    (p) => p.id === input.id || p.surface === input.surface
  );
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: FeedEmergencyPolicy = {
    id: input.id,
    surface: input.surface,
    killSwitchEnabled: input.killSwitchEnabled ?? false,
    fallbackEnabled: input.fallbackEnabled ?? false,
    fallbackMode: input.fallbackMode ?? "previous_live_version",
    autoDisableEnabled: input.autoDisableEnabled ?? false,
    errorRateThreshold: input.errorRateThreshold ?? 0,
    emptyFeedThreshold: input.emptyFeedThreshold ?? 0,
    ctrDropThreshold: input.ctrDropThreshold ?? 0,
    emergencyNoticeEnabled: input.emergencyNoticeEnabled ?? false,
    emergencyNoticeText: input.emergencyNoticeText ?? "",
    updatedAt: now,
    adminMemo: input.adminMemo ?? "",
  };
  POLICIES.push(policy);
  return policy;
}

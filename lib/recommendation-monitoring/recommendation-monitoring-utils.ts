/**
 * 35단계: 헬스 상태 계산, 임계치 기반 status, 요약 집계
 */

import type { HealthStatus } from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getFeedMode } from "@/lib/feed-emergency/feed-emergency-utils";
import { getActiveFeedVersionBySurface } from "@/lib/recommendation-deployments/mock-active-feed-versions";
import { getRecommendationDeployments } from "@/lib/recommendation-deployments/mock-recommendation-deployments";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

/** successRate/emptyFeedRate 기반 status (임계치: success < 0.95 warning, < 0.9 critical; empty > 0.1 warning, > 0.2 critical) */
export function computeHealthStatusFromRates(
  successRate: number,
  emptyFeedRate: number,
  fallbackActive: boolean,
  killSwitchActive: boolean
): HealthStatus {
  if (killSwitchActive) return "critical";
  if (fallbackActive) return "warning";
  if (successRate < 0.9 || emptyFeedRate > 0.2) return "critical";
  if (successRate < 0.95 || emptyFeedRate > 0.1) return "warning";
  return "healthy";
}

/** surface별 실시간 fallback/kill/liveVersion/latestDeployment 읽기 */
export function getLiveMonitoringSnapshot() {
  const now = new Date().toISOString();
  return SURFACES.map((surface) => {
    const mode = getFeedMode(surface);
    const active = getActiveFeedVersionBySurface(surface);
    const deployments = getRecommendationDeployments({ surface });
    const latest = deployments[0];
    return {
      surface,
      fallbackActive: mode === "fallback",
      killSwitchActive: mode === "kill_switch",
      liveVersionId: active?.liveVersionId ?? null,
      latestDeploymentStatus: latest?.deploymentStatus ?? null,
      lastCheckedAt: now,
    };
  });
}

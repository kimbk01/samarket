/**
 * 35단계: surface별 헬스 상태 mock (실시간 상태 반영)
 */

import type {
  RecommendationHealthStatus,
  HealthStatus,
} from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getLiveMonitoringSnapshot } from "./recommendation-monitoring-utils";
import { computeHealthStatusFromRates } from "./recommendation-monitoring-utils";

/** Mock 지표 (실제로는 31단계 analytics 등에서 집계) */
const MOCK_METRICS: Record<
  RecommendationSurface,
  { successRate: number; emptyFeedRate: number; avgCtr: number; avgConversionRate: number }
> = {
  home: { successRate: 0.98, emptyFeedRate: 0.02, avgCtr: 0.04, avgConversionRate: 0.07 },
  search: { successRate: 0.96, emptyFeedRate: 0.03, avgCtr: 0.035, avgConversionRate: 0.06 },
  shop: { successRate: 0.97, emptyFeedRate: 0.025, avgCtr: 0.038, avgConversionRate: 0.065 },
};

export function getRecommendationHealthStatuses(
  surface?: RecommendationSurface
): RecommendationHealthStatus[] {
  const snapshot = getLiveMonitoringSnapshot();
  const now = new Date().toISOString();
  const list: RecommendationHealthStatus[] = snapshot.map((s) => {
    const metrics = MOCK_METRICS[s.surface];
    const status = computeHealthStatusFromRates(
      metrics.successRate,
      metrics.emptyFeedRate,
      s.fallbackActive,
      s.killSwitchActive
    );
    return {
      id: `rhs-${s.surface}`,
      surface: s.surface,
      status,
      successRate: metrics.successRate,
      emptyFeedRate: metrics.emptyFeedRate,
      fallbackActive: s.fallbackActive,
      killSwitchActive: s.killSwitchActive,
      avgCtr: metrics.avgCtr,
      avgConversionRate: metrics.avgConversionRate,
      liveVersionId: s.liveVersionId,
      latestDeploymentStatus: s.latestDeploymentStatus,
      lastCheckedAt: s.lastCheckedAt,
      note: "",
    };
  });
  if (surface) return list.filter((h) => h.surface === surface);
  return list;
}

export function getRecommendationHealthStatusBySurface(
  surface: RecommendationSurface
): RecommendationHealthStatus | undefined {
  return getRecommendationHealthStatuses(surface)[0];
}

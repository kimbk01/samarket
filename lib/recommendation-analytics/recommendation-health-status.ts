/**
 * surface별 헬스 상태 (실시간 상태 + 분석 지표 반영)
 */
import type { RecommendationHealthStatus } from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  getLiveMonitoringSnapshot,
  computeHealthStatusFromRates,
} from "@/lib/recommendation-monitoring/recommendation-monitoring-utils";
import { getSurfaceMetrics } from "@/lib/recommendation-analytics/recommendation-analytics-state";

export function getRecommendationHealthStatuses(
  surface?: RecommendationSurface
): RecommendationHealthStatus[] {
  const snapshot = getLiveMonitoringSnapshot();
  const surfaceMetrics = getSurfaceMetrics();
  const list: RecommendationHealthStatus[] = snapshot.map((s) => {
    const metrics = surfaceMetrics[s.surface];
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

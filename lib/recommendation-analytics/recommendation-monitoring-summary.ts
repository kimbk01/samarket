/**
 * 모니터링 요약 (헬스/이슈/알림 집계). 열린 이슈·미확인 알림 = DB 요약 RPC 전체 건수 (상한 없음 — R7 후속).
 */
import type { RecommendationMonitoringSummary } from "@/lib/types/recommendation-monitoring";
import { getRecommendationHealthStatuses } from "@/lib/recommendation-analytics/recommendation-health-status";
import { getRecommendationRecordsSummary } from "@/lib/recommendation-ops/recommendation-records-summary-state";

export function getRecommendationMonitoringSummary(): RecommendationMonitoringSummary {
  const now = new Date().toISOString();
  const statuses = getRecommendationHealthStatuses();
  const records = getRecommendationRecordsSummary();

  let totalHealthy = 0;
  let totalWarning = 0;
  let totalCritical = 0;
  let fallbackSurfaceCount = 0;
  let killSwitchSurfaceCount = 0;

  for (const s of statuses) {
    if (s.status === "healthy") totalHealthy++;
    else if (s.status === "warning") totalWarning++;
    else totalCritical++;
    if (s.fallbackActive) fallbackSurfaceCount++;
    if (s.killSwitchActive) killSwitchSurfaceCount++;
  }

  return {
    totalHealthy,
    totalWarning,
    totalCritical,
    openIncidentCount: records.incidents.open,
    activeAlertCount: records.alertEvents.unacknowledged,
    fallbackSurfaceCount,
    killSwitchSurfaceCount,
    latestCheckedAt: statuses[0]?.lastCheckedAt ?? now,
  };
}

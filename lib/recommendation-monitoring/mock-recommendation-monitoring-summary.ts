/**
 * 35단계: 모니터링 요약 mock (헬스/이슈/알림 집계)
 */

import type { RecommendationMonitoringSummary } from "@/lib/types/recommendation-monitoring";
import { getRecommendationHealthStatuses } from "./mock-recommendation-health-statuses";
import { getRecommendationIncidents } from "./mock-recommendation-incidents";
import { getRecommendationAlertEvents } from "./mock-recommendation-alert-events";

export function getRecommendationMonitoringSummary(): RecommendationMonitoringSummary {
  const now = new Date().toISOString();
  const statuses = getRecommendationHealthStatuses();
  const openIncidents = getRecommendationIncidents({ status: "open" });
  const unackAlerts = getRecommendationAlertEvents({ isAcknowledged: false });

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
    openIncidentCount: openIncidents.length,
    activeAlertCount: unackAlerts.length,
    fallbackSurfaceCount,
    killSwitchSurfaceCount,
    latestCheckedAt: statuses[0]?.lastCheckedAt ?? now,
  };
}

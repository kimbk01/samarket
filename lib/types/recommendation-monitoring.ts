/**
 * 35단계: 추천 운영 모니터링 / 헬스 / 이슈 / 알림 타입
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";

export type HealthStatus = "healthy" | "warning" | "critical";

export interface RecommendationHealthStatus {
  id: string;
  surface: RecommendationSurface;
  status: HealthStatus;
  successRate: number;
  emptyFeedRate: number;
  fallbackActive: boolean;
  killSwitchActive: boolean;
  avgCtr: number;
  avgConversionRate: number;
  liveVersionId: string | null;
  latestDeploymentStatus: string | null;
  lastCheckedAt: string;
  note: string;
}

export interface RecommendationSectionHealth {
  id: string;
  surface: RecommendationSurface;
  sectionKey: string;
  status: HealthStatus;
  impressionCount: number;
  clickCount: number;
  ctr: number;
  emptyRate: number;
  dedupeDropRate: number;
  updatedAt: string;
}

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentType =
  | "empty_feed_spike"
  | "ctr_drop"
  | "conversion_drop"
  | "fallback_activated"
  | "kill_switch_enabled"
  | "deployment_failure"
  | "section_disabled";

export type IncidentStatus = "open" | "acknowledged" | "resolved";

export interface RecommendationIncident {
  id: string;
  surface: RecommendationSurface;
  severity: IncidentSeverity;
  incidentType: IncidentType;
  title: string;
  description: string;
  status: IncidentStatus;
  relatedVersionId: string | null;
  relatedDeploymentId: string | null;
  startedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedByAdminId: string | null;
  acknowledgedByAdminNickname: string | null;
}

export type AlertMetricKey =
  | "success_rate"
  | "empty_feed_rate"
  | "ctr"
  | "conversion_rate"
  | "fallback_active"
  | "kill_switch_active";

export type AlertComparator = "lt" | "gt" | "eq";

export type AlertSeverity = "warning" | "critical";

export type AlertChannel = "email" | "slack" | "sms" | "dashboard_only";

export interface RecommendationAlertRule {
  id: string;
  surface: RecommendationSurface;
  metricKey: AlertMetricKey;
  comparator: AlertComparator;
  thresholdValue: number;
  severity: AlertSeverity;
  channel: AlertChannel;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationAlertEvent {
  id: string;
  ruleId: string;
  surface: RecommendationSurface;
  severity: AlertSeverity;
  metricKey: AlertMetricKey;
  currentValue: number;
  thresholdValue: number;
  message: string;
  isAcknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedByAdminId: string | null;
  createdAt: string;
}

export interface RecommendationMonitoringSummary {
  totalHealthy: number;
  totalWarning: number;
  totalCritical: number;
  openIncidentCount: number;
  activeAlertCount: number;
  fallbackSurfaceCount: number;
  killSwitchSurfaceCount: number;
  latestCheckedAt: string;
}

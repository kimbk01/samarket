/**
 * 35단계: 알림 이벤트 mock (상태 악화 시 생성, ack 처리)
 */

import type {
  RecommendationAlertEvent,
  AlertMetricKey,
  AlertSeverity,
} from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const EVENTS: RecommendationAlertEvent[] = [
  {
    id: "rae-1",
    ruleId: "rar-1",
    surface: "home",
    severity: "warning",
    metricKey: "empty_feed_rate",
    currentValue: 0.18,
    thresholdValue: 0.15,
    message: "홈 empty_feed_rate 0.18이(가) 임계치 0.15 초과",
    isAcknowledged: true,
    acknowledgedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    acknowledgedByAdminId: "admin1",
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
];

export function getRecommendationAlertEvents(filters?: {
  surface?: RecommendationSurface;
  isAcknowledged?: boolean;
  limit?: number;
}): RecommendationAlertEvent[] {
  let list = [...EVENTS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.surface) list = list.filter((e) => e.surface === filters.surface);
  if (filters?.isAcknowledged !== undefined)
    list = list.filter((e) => e.isAcknowledged === filters.isAcknowledged);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function addRecommendationAlertEvent(
  input: Omit<
    RecommendationAlertEvent,
    "id" | "isAcknowledged" | "acknowledgedAt" | "acknowledgedByAdminId"
  >
): RecommendationAlertEvent {
  const ev: RecommendationAlertEvent = {
    ...input,
    id: `rae-${Date.now()}`,
    isAcknowledged: false,
    acknowledgedAt: null,
    acknowledgedByAdminId: null,
  };
  EVENTS.unshift(ev);
  return { ...ev };
}

export function acknowledgeAlertEvent(
  id: string,
  adminId: string
): RecommendationAlertEvent | null {
  const ev = EVENTS.find((e) => e.id === id);
  if (!ev) return null;
  ev.isAcknowledged = true;
  ev.acknowledgedAt = new Date().toISOString();
  ev.acknowledgedByAdminId = adminId;
  return { ...ev };
}

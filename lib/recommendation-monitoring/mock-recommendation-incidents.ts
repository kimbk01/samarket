/**
 * 35단계: 운영 이슈 mock
 */

import type {
  RecommendationIncident,
  IncidentStatus,
} from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const now = new Date().toISOString();
const INCIDENTS: RecommendationIncident[] = [
  {
    id: "ri-1",
    surface: "home",
    severity: "medium",
    incidentType: "empty_feed_spike",
    title: "홈 빈 피드 일시 증가",
    description: "일시적으로 빈 피드 비율이 상승했습니다.",
    status: "resolved",
    relatedVersionId: null,
    relatedDeploymentId: null,
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    resolvedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    acknowledgedAt: new Date(Date.now() - 1000 * 60 * 60 * 23).toISOString(),
    acknowledgedByAdminId: "admin1",
    acknowledgedByAdminNickname: "관리자",
  },
];

export function getRecommendationIncidents(filters?: {
  surface?: RecommendationSurface;
  status?: IncidentStatus;
}): RecommendationIncident[] {
  let list = [...INCIDENTS].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  if (filters?.surface) list = list.filter((i) => i.surface === filters.surface);
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  return list;
}

export function getRecommendationIncidentById(
  id: string
): RecommendationIncident | undefined {
  return INCIDENTS.find((i) => i.id === id);
}

export function addRecommendationIncident(
  input: Omit<RecommendationIncident, "id" | "resolvedAt" | "acknowledgedAt" | "acknowledgedByAdminId" | "acknowledgedByAdminNickname">
): RecommendationIncident {
  const incident: RecommendationIncident = {
    ...input,
    id: `ri-${Date.now()}`,
    resolvedAt: null,
    acknowledgedAt: null,
    acknowledgedByAdminId: null,
    acknowledgedByAdminNickname: null,
  };
  INCIDENTS.unshift(incident);
  return { ...incident };
}

export function acknowledgeIncident(
  id: string,
  adminId: string,
  adminNickname: string
): RecommendationIncident | null {
  const inc = INCIDENTS.find((i) => i.id === id);
  if (!inc) return null;
  const now = new Date().toISOString();
  inc.status = "acknowledged";
  inc.acknowledgedAt = now;
  inc.acknowledgedByAdminId = adminId;
  inc.acknowledgedByAdminNickname = adminNickname;
  return { ...inc };
}

export function resolveIncident(id: string): RecommendationIncident | null {
  const inc = INCIDENTS.find((i) => i.id === id);
  if (!inc) return null;
  inc.status = "resolved";
  inc.resolvedAt = new Date().toISOString();
  return { ...inc };
}

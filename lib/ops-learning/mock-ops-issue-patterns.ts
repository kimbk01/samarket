/**
 * 43단계: 반복 이슈 패턴 mock (surface / incidentType / sectionKey / versionId 등 그룹화)
 */

import type { OpsIssuePattern, OpsLearningStatus } from "@/lib/types/ops-learning";

const PATTERNS: OpsIssuePattern[] = [
  {
    id: "oip-1",
    patternKey: "home_empty_feed_spike",
    title: "홈 빈 피드 일시 증가 반복",
    surface: "home",
    incidentType: "empty_feed_spike",
    sectionKey: null,
    versionId: null,
    category: "recommendation",
    occurrenceCount: 3,
    firstOccurredAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    lastOccurredAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    avgResolutionMinutes: 120,
    recurrenceRate: 0.4,
    severityTrend: "stable",
    linkedDocumentId: "od-1",
    linkedRunbookDocumentId: "od-1",
    status: "reviewing",
  },
  {
    id: "oip-2",
    patternKey: "all_rollback_version",
    title: "추천 버전 롤백 관련 패턴",
    surface: "all",
    incidentType: "rollback",
    sectionKey: null,
    versionId: "rv-1",
    category: "rollback",
    occurrenceCount: 2,
    firstOccurredAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    lastOccurredAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    avgResolutionMinutes: 60,
    recurrenceRate: 0.2,
    severityTrend: "decreasing",
    linkedDocumentId: "od-3",
    linkedRunbookDocumentId: "od-3",
    status: "mitigated",
  },
  {
    id: "oip-3",
    patternKey: "home_fallback",
    title: "홈 Fallback 발생 패턴",
    surface: "home",
    incidentType: "fallback",
    sectionKey: "personalized",
    versionId: null,
    category: "incident_response",
    occurrenceCount: 1,
    firstOccurredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    lastOccurredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    avgResolutionMinutes: null,
    recurrenceRate: null,
    severityTrend: "stable",
    linkedDocumentId: "od-1",
    linkedRunbookDocumentId: null,
    status: "detected",
  },
];

export function getOpsIssuePatterns(filters?: {
  status?: OpsLearningStatus;
  surface?: string;
  incidentType?: string;
  limit?: number;
}): OpsIssuePattern[] {
  let list = [...PATTERNS].sort(
    (a, b) => new Date(b.lastOccurredAt).getTime() - new Date(a.lastOccurredAt).getTime()
  );
  if (filters?.status) list = list.filter((p) => p.status === filters.status);
  if (filters?.surface) list = list.filter((p) => p.surface === filters.surface);
  if (filters?.incidentType) list = list.filter((p) => p.incidentType === filters.incidentType);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsIssuePatternById(id: string): OpsIssuePattern | undefined {
  return PATTERNS.find((p) => p.id === id);
}

export function getOpsIssuePatternByPatternKey(patternKey: string): OpsIssuePattern | undefined {
  return PATTERNS.find((p) => p.patternKey === patternKey);
}

/**
 * 45단계: 분기별 개선 계획 mock (44 로드맵 연계)
 */

import type {
  OpsQuarterlyPlan,
  OpsQuarterlyPlanStatus,
  OpsBenchmarkDomain,
} from "@/lib/types/ops-benchmarks";

const PLANS: OpsQuarterlyPlan[] = [
  {
    id: "oqp-1",
    year: new Date().getFullYear(),
    quarter: "Q1",
    title: "추천 품질 목표 80점 달성",
    description: "CTR/전환율 기반 추천 품질 벤치마크 상향",
    domain: "recommendation_quality",
    status: "in_progress",
    priority: "high",
    targetMetric: "recommendation_quality_score",
    targetValue: "80",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    relatedRoadmapItemId: "oir-1",
    milestone: "Q1 추천 품질",
    dueDate: new Date(new Date().getFullYear(), 2, 31).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    note: "",
  },
  {
    id: "oqp-2",
    year: new Date().getFullYear(),
    quarter: "Q1",
    title: "장애 대응 평균 해결시간 30분 이하",
    description: "incident 평균 해결시간 단축",
    domain: "incident_response",
    status: "approved",
    priority: "critical",
    targetMetric: "incident_avg_resolution_minutes",
    targetValue: "30",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    relatedRoadmapItemId: "oir-3",
    milestone: "Q1 대응 강화",
    dueDate: new Date(new Date().getFullYear(), 2, 31).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    completedAt: null,
    note: "",
  },
  {
    id: "oqp-3",
    year: new Date().getFullYear(),
    quarter: "Q1",
    title: "문서 최신화율 90% 이상",
    description: "SOP/플레이북 최신화 주기 정립",
    domain: "documentation",
    status: "planned",
    priority: "medium",
    targetMetric: "document_freshness_rate",
    targetValue: "0.9",
    ownerAdminId: null,
    ownerAdminNickname: null,
    relatedRoadmapItemId: "oir-2",
    milestone: "Q1 문서화",
    dueDate: new Date(new Date().getFullYear(), 2, 31).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    completedAt: null,
    note: "",
  },
  {
    id: "oqp-4",
    year: new Date().getFullYear(),
    quarter: "Q2",
    title: "자동화 수준 70점 이상",
    description: "fallback/rollback 자동화율 상향",
    domain: "automation",
    status: "planned",
    priority: "high",
    targetMetric: "automation_score",
    targetValue: "70",
    ownerAdminId: null,
    ownerAdminNickname: null,
    relatedRoadmapItemId: null,
    milestone: "Q2 자동화",
    dueDate: new Date(new Date().getFullYear(), 5, 30).toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    note: "",
  },
  {
    id: "oqp-5",
    year: new Date().getFullYear(),
    quarter: "Q1",
    title: "학습/회고 반영률 개선",
    description: "회고 액션아이템 반영률 80% 목표",
    domain: "learning",
    status: "at_risk",
    priority: "high",
    targetMetric: "learning_contribution_rate",
    targetValue: "0.8",
    ownerAdminId: "admin2",
    ownerAdminNickname: "운영B",
    relatedRoadmapItemId: null,
    milestone: "Q1 학습",
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    note: "기한 임박",
  },
  {
    id: "oqp-6",
    year: new Date().getFullYear() - 1,
    quarter: "Q4",
    title: "모니터링 대시보드 정비",
    description: "헬스체크/알림 연동 완료",
    domain: "execution",
    status: "completed",
    priority: "medium",
    targetMetric: "monitoring_health_ok",
    targetValue: "100%",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    relatedRoadmapItemId: null,
    milestone: "전년 Q4",
    dueDate: new Date(new Date().getFullYear() - 1, 11, 31).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    completedAt: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
    note: "",
  },
];

export function getOpsQuarterlyPlans(filters?: {
  year?: number;
  quarter?: "Q1" | "Q2" | "Q3" | "Q4";
  status?: OpsQuarterlyPlanStatus;
  domain?: OpsBenchmarkDomain;
}): OpsQuarterlyPlan[] {
  let list = [...PLANS].sort(
    (a, b) =>
      b.year - a.year ||
      ["Q4", "Q3", "Q2", "Q1"].indexOf(a.quarter) - ["Q4", "Q3", "Q2", "Q1"].indexOf(b.quarter)
  );
  if (filters?.year !== undefined) list = list.filter((p) => p.year === filters.year);
  if (filters?.quarter) list = list.filter((p) => p.quarter === filters.quarter);
  if (filters?.status) list = list.filter((p) => p.status === filters.status);
  if (filters?.domain) list = list.filter((p) => p.domain === filters.domain);
  return list;
}

export function getOpsQuarterlyPlanById(id: string): OpsQuarterlyPlan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function getCurrentQuarter(): string {
  const m = new Date().getMonth();
  const y = new Date().getFullYear();
  if (m < 3) return `${y}-Q1`;
  if (m < 6) return `${y}-Q2`;
  if (m < 9) return `${y}-Q3`;
  return `${y}-Q4`;
}

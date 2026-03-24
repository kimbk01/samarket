/**
 * 45단계: 관리자 성과 리뷰 mock (35 incident, 38 checklist/action, 39 docs, 40 runbook, 43 learning 기반)
 */

import type {
  OpsAdminPerformanceReview,
  OpsPerformanceReviewStatus,
} from "@/lib/types/ops-benchmarks";

const REVIEWS: OpsAdminPerformanceReview[] = [
  {
    id: "opr-1",
    reviewPeriod: new Date().toISOString().slice(0, 7),
    adminId: "admin1",
    adminNickname: "관리자",
    incidentContributionScore: 85,
    checklistCompletionRate: 92,
    actionCompletionRate: 88,
    documentContributionScore: 78,
    runbookContributionScore: 82,
    learningContributionScore: 80,
    overallPerformanceScore: 84,
    status: "published",
    reviewNote: "전반적으로 우수. 문서 기여도 보강 권장.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "opr-2",
    reviewPeriod: new Date().toISOString().slice(0, 7),
    adminId: "admin2",
    adminNickname: "운영B",
    incidentContributionScore: 72,
    checklistCompletionRate: 85,
    actionCompletionRate: 70,
    documentContributionScore: 65,
    runbookContributionScore: 75,
    learningContributionScore: 68,
    overallPerformanceScore: 71,
    status: "published",
    reviewNote: "액션아이템 완료율 개선 필요.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "opr-3",
    reviewPeriod: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7),
    adminId: "admin1",
    adminNickname: "관리자",
    incidentContributionScore: 82,
    checklistCompletionRate: 90,
    actionCompletionRate: 85,
    documentContributionScore: 75,
    runbookContributionScore: 80,
    learningContributionScore: 78,
    overallPerformanceScore: 82,
    status: "archived",
    reviewNote: "",
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
];

export function getOpsAdminPerformanceReviews(filters?: {
  reviewPeriod?: string;
  adminId?: string;
  status?: OpsPerformanceReviewStatus;
}): OpsAdminPerformanceReview[] {
  let list = [...REVIEWS].sort(
    (a, b) =>
      new Date(b.reviewPeriod).getTime() - new Date(a.reviewPeriod).getTime()
  );
  if (filters?.reviewPeriod)
    list = list.filter((r) => r.reviewPeriod === filters.reviewPeriod);
  if (filters?.adminId) list = list.filter((r) => r.adminId === filters.adminId);
  if (filters?.status) list = list.filter((r) => r.status === filters.status);
  return list;
}

export function getOpsAdminPerformanceReviewById(
  id: string
): OpsAdminPerformanceReview | undefined {
  return REVIEWS.find((r) => r.id === id);
}

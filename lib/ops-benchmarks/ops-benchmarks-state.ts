/**
 * 운영 벤치마크 — 벤치마크·분기 계획·성과 리뷰 단일 저장소.
 * 영속화: `ops-benchmarks-db` + `/api/admin/ops-benchmarks`
 */
import { getLatestOpsMaturityScore } from "@/lib/ops-maturity/ops-maturity-state";
import type {
  OpsBenchmark,
  OpsBenchmarkScope,
  OpsBenchmarkDomain,
  OpsBenchmarkTrend,
  OpsQuarterlyPlan,
  OpsQuarterlyPlanStatus,
  OpsAdminPerformanceReview,
  OpsPerformanceReviewStatus,
} from "@/lib/types/ops-benchmarks";

type MaturityScoreKey =
  | "recommendationQualityScore"
  | "responseScore"
  | "automationScore"
  | "documentationScore"
  | "monitoringScore"
  | "learningScore";

const DOMAIN_TO_MATURITY_KEY: Record<OpsBenchmarkDomain, MaturityScoreKey> = {
  recommendation_quality: "recommendationQualityScore",
  incident_response: "responseScore",
  automation: "automationScore",
  documentation: "documentationScore",
  execution: "monitoringScore",
  learning: "learningScore",
};

function buildBenchmarksFromMaturity(
  benchmarkDate: string,
  scope: OpsBenchmarkScope
): OpsBenchmark[] {
  const latest = getLatestOpsMaturityScore(scope === "quarterly" ? "weekly" : "monthly");
  const domains: OpsBenchmarkDomain[] = [
    "recommendation_quality",
    "incident_response",
    "automation",
    "documentation",
    "execution",
    "learning",
  ];
  const now = new Date().toISOString();
  return domains.map((domain, i) => {
    const key = DOMAIN_TO_MATURITY_KEY[domain];
    const currentScore = latest ? (latest[key] as number) + (i % 3 === 0 ? 2 : 0) : 70;
    const targetScore = Math.min(100, currentScore + 5 + (i % 2) * 5);
    const referenceScore = 75;
    const gapScore = targetScore - currentScore;
    const trend: OpsBenchmarkTrend =
      gapScore <= 0 ? "improving" : currentScore >= referenceScore ? "stable" : "declining";
    return {
      id: `ob-${scope}-${domain}-${benchmarkDate}`,
      benchmarkDate,
      scope,
      domain,
      currentScore,
      targetScore,
      referenceScore,
      gapScore,
      trend,
      createdAt: now,
      updatedAt: now,
      note: "",
    };
  });
}

function defaultBenchmarks(): OpsBenchmark[] {
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date().getFullYear();
  const q1 = `${y}-01-01`;
  const q2 = `${y}-04-01`;
  const q3 = `${y}-07-01`;
  const q4 = `${y}-10-01`;
  return [
    ...buildBenchmarksFromMaturity(today, "quarterly"),
    ...buildBenchmarksFromMaturity(q1, "yearly"),
    ...buildBenchmarksFromMaturity(q2, "yearly"),
    ...buildBenchmarksFromMaturity(q3, "yearly"),
    ...buildBenchmarksFromMaturity(q4, "yearly"),
  ];
}

function defaultQuarterlyPlans(): OpsQuarterlyPlan[] {
  return [
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
}

function defaultAdminPerformanceReviews(): OpsAdminPerformanceReview[] {
  return [
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
}

const BENCHMARKS: OpsBenchmark[] = defaultBenchmarks();
const QUARTERLY_PLANS: OpsQuarterlyPlan[] = defaultQuarterlyPlans();
const ADMIN_PERFORMANCE_REVIEWS: OpsAdminPerformanceReview[] =
  defaultAdminPerformanceReviews();

export type OpsBenchmarksBundleV1 = {
  version: 1;
  benchmarks: OpsBenchmark[];
  quarterlyPlans: OpsQuarterlyPlan[];
  adminPerformanceReviews: OpsAdminPerformanceReview[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultOpsBenchmarksBundle(): OpsBenchmarksBundleV1 {
  return {
    version: 1,
    benchmarks: defaultBenchmarks().map((b) => ({ ...b })),
    quarterlyPlans: defaultQuarterlyPlans().map((p) => ({ ...p })),
    adminPerformanceReviews: defaultAdminPerformanceReviews().map((r) => ({ ...r })),
  };
}

export function importOpsBenchmarksBundle(bundle: OpsBenchmarksBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(BENCHMARKS, (bundle.benchmarks ?? []).map((b) => ({ ...b })));
  replaceArray(QUARTERLY_PLANS, (bundle.quarterlyPlans ?? []).map((p) => ({ ...p })));
  replaceArray(
    ADMIN_PERFORMANCE_REVIEWS,
    (bundle.adminPerformanceReviews ?? []).map((r) => ({ ...r }))
  );
  if (!BENCHMARKS.length) replaceArray(BENCHMARKS, defaultBenchmarks());
  if (!QUARTERLY_PLANS.length) replaceArray(QUARTERLY_PLANS, defaultQuarterlyPlans());
  if (!ADMIN_PERFORMANCE_REVIEWS.length)
    replaceArray(ADMIN_PERFORMANCE_REVIEWS, defaultAdminPerformanceReviews());
}

export function exportOpsBenchmarksBundle(): OpsBenchmarksBundleV1 {
  return {
    version: 1,
    benchmarks: BENCHMARKS.map((b) => ({ ...b })),
    quarterlyPlans: QUARTERLY_PLANS.map((p) => ({ ...p })),
    adminPerformanceReviews: ADMIN_PERFORMANCE_REVIEWS.map((r) => ({ ...r })),
  };
}

/* ─── benchmarks ────────────────────────────────────────────── */

export function getOpsBenchmarks(filters?: {
  scope?: OpsBenchmarkScope;
  benchmarkDate?: string;
  domain?: OpsBenchmarkDomain;
}): OpsBenchmark[] {
  let list = [...BENCHMARKS];
  if (filters?.scope) list = list.filter((b) => b.scope === filters.scope);
  if (filters?.benchmarkDate) list = list.filter((b) => b.benchmarkDate === filters.benchmarkDate);
  if (filters?.domain) list = list.filter((b) => b.domain === filters.domain);
  return list.sort(
    (a, b) => new Date(b.benchmarkDate).getTime() - new Date(a.benchmarkDate).getTime()
  );
}

export function getLatestOpsBenchmarks(scope: OpsBenchmarkScope): OpsBenchmark[] {
  const list = getOpsBenchmarks({ scope });
  if (list.length === 0) return [];
  const latestDate = list[0].benchmarkDate;
  return list.filter((b) => b.benchmarkDate === latestDate);
}

export function getOpsBenchmarkByDomain(
  scope: OpsBenchmarkScope,
  domain: OpsBenchmarkDomain,
  benchmarkDate?: string
): OpsBenchmark | undefined {
  const list = getOpsBenchmarks({ scope, domain });
  if (list.length === 0) return undefined;
  if (benchmarkDate) return list.find((b) => b.benchmarkDate === benchmarkDate);
  return list[0];
}

/* ─── quarterly plans ───────────────────────────────────────── */

export function getOpsQuarterlyPlans(filters?: {
  year?: number;
  quarter?: "Q1" | "Q2" | "Q3" | "Q4";
  status?: OpsQuarterlyPlanStatus;
  domain?: OpsBenchmarkDomain;
}): OpsQuarterlyPlan[] {
  let list = [...QUARTERLY_PLANS].sort(
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
  return QUARTERLY_PLANS.find((p) => p.id === id);
}

export function getCurrentQuarter(): string {
  const m = new Date().getMonth();
  const y = new Date().getFullYear();
  if (m < 3) return `${y}-Q1`;
  if (m < 6) return `${y}-Q2`;
  if (m < 9) return `${y}-Q3`;
  return `${y}-Q4`;
}

/* ─── admin performance reviews ─────────────────────────────── */

export function getOpsAdminPerformanceReviews(filters?: {
  reviewPeriod?: string;
  adminId?: string;
  status?: OpsPerformanceReviewStatus;
}): OpsAdminPerformanceReview[] {
  let list = [...ADMIN_PERFORMANCE_REVIEWS].sort(
    (a, b) => new Date(b.reviewPeriod).getTime() - new Date(a.reviewPeriod).getTime()
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
  return ADMIN_PERFORMANCE_REVIEWS.find((r) => r.id === id);
}

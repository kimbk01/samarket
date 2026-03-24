/**
 * 32단계: 추천 A/B 실험 정책 mock
 */

import type {
  RecommendationExperiment,
  ExperimentStatus,
} from "@/lib/types/recommendation-experiment";

const now = new Date().toISOString();

const EXPERIMENTS: RecommendationExperiment[] = [
  {
    id: "exp-1",
    experimentName: "홈 추천 섹션 비중 실험",
    description: "추천 상품 섹션 확대 vs 대조군",
    status: "running",
    targetSurface: "home",
    controlVersionId: "fv-control-home",
    variantVersionIds: ["fv-variant-a-home", "fv-variant-b-home"],
    trafficAllocationType: "percentage",
    controlPercentage: 50,
    variantPercentages: [25, 25],
    targetRegions: [],
    targetMemberTypes: [],
    startAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    endAt: null,
    createdAt: now,
    updatedAt: now,
    adminMemo: "홈 피드 A/B 테스트",
  },
  {
    id: "exp-2",
    experimentName: "검색 추천 가중치 실험 (초안)",
    description: "검색 결과 추천 점수 가중치 차등",
    status: "draft",
    targetSurface: "search",
    controlVersionId: "fv-control-home",
    variantVersionIds: ["fv-variant-a-home"],
    trafficAllocationType: "percentage",
    controlPercentage: 70,
    variantPercentages: [30],
    targetRegions: [],
    targetMemberTypes: [],
    startAt: null,
    endAt: null,
    createdAt: now,
    updatedAt: now,
    adminMemo: "draft",
  },
];

export function getRecommendationExperiments(): RecommendationExperiment[] {
  return [...EXPERIMENTS];
}

export function getRunningExperiments(): RecommendationExperiment[] {
  return EXPERIMENTS.filter((e) => e.status === "running");
}

export function getRecommendationExperimentById(
  id: string
): RecommendationExperiment | undefined {
  return EXPERIMENTS.find((e) => e.id === id);
}

export function saveRecommendationExperiment(
  input: Omit<RecommendationExperiment, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  }
): RecommendationExperiment {
  const now = new Date().toISOString();
  const existing = EXPERIMENTS.find((e) => e.id === input.id);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const exp: RecommendationExperiment = { ...input, createdAt: now, updatedAt: now };
  EXPERIMENTS.push(exp);
  return { ...exp };
}

export function setExperimentStatus(
  id: string,
  status: ExperimentStatus
): RecommendationExperiment | undefined {
  const e = EXPERIMENTS.find((x) => x.id === id);
  if (!e) return undefined;
  e.status = status;
  e.updatedAt = new Date().toISOString();
  if (status === "running") e.startAt = e.startAt || new Date().toISOString();
  if (status === "ended") e.endAt = new Date().toISOString();
  return { ...e };
}

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  draft: "초안",
  running: "진행중",
  paused: "일시중지",
  ended: "종료",
};

export const TRAFFIC_ALLOCATION_LABELS: Record<
  RecommendationExperiment["trafficAllocationType"],
  string
> = {
  percentage: "비율",
  region_based: "지역 기준",
  member_type_based: "회원유형 기준",
};

/**
 * 33단계: 추천 버전 배포 이력 mock
 */

import type {
  RecommendationDeployment,
  DeploymentStatus,
  RecommendationSurface,
} from "@/lib/types/recommendation-deployment";

const now = new Date().toISOString();

const DEPLOYMENTS: RecommendationDeployment[] = [
  {
    id: "rd-1",
    surface: "home",
    deploymentName: "홈 기본 버전 배포",
    sourceExperimentId: null,
    deployedVersionId: "fv-control-home",
    previousVersionId: null,
    deploymentStatus: "success",
    rolloutType: "full",
    rolloutPercent: 100,
    deployedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    scheduledAt: null,
    note: "초기 배포",
    createdAt: now,
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
];

export function getRecommendationDeployments(filters?: {
  surface?: RecommendationSurface;
  status?: DeploymentStatus;
}): RecommendationDeployment[] {
  let list = [...DEPLOYMENTS];
  if (filters?.surface) list = list.filter((d) => d.surface === filters.surface);
  if (filters?.status) list = list.filter((d) => d.deploymentStatus === filters.status);
  return list.sort(
    (a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()
  );
}

export function getRecommendationDeploymentById(
  id: string
): RecommendationDeployment | undefined {
  return DEPLOYMENTS.find((d) => d.id === id);
}

export function addRecommendationDeployment(
  input: Omit<RecommendationDeployment, "id">
): RecommendationDeployment {
  const d: RecommendationDeployment = {
    ...input,
    id: `rd-${Date.now()}`,
  };
  DEPLOYMENTS.unshift(d);
  return { ...d };
}

export function setDeploymentStatus(
  id: string,
  status: DeploymentStatus
): RecommendationDeployment | undefined {
  const d = DEPLOYMENTS.find((x) => x.id === id);
  if (!d) return undefined;
  d.deploymentStatus = status;
  return { ...d };
}

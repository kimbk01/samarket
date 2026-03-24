/**
 * 33단계: 배포 로그 mock
 */

import type {
  RecommendationDeploymentLog,
  DeploymentLogActionType,
} from "@/lib/types/recommendation-deployment";

const LOGS: RecommendationDeploymentLog[] = [
  {
    id: "rdl-1",
    deploymentId: "rd-1",
    actionType: "deploy",
    actorType: "admin",
    actorId: "admin1",
    actorNickname: "관리자",
    note: "홈 기본 버전 배포",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

export function getRecommendationDeploymentLogs(
  deploymentId?: string
): RecommendationDeploymentLog[] {
  let list = [...LOGS];
  if (deploymentId) list = list.filter((l) => l.deploymentId === deploymentId);
  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addRecommendationDeploymentLog(
  deploymentId: string,
  actionType: DeploymentLogActionType,
  note: string,
  actorType: "admin" | "system" = "admin",
  actorId = "admin1",
  actorNickname = "관리자"
): RecommendationDeploymentLog {
  const log: RecommendationDeploymentLog = {
    id: `rdl-${Date.now()}`,
    deploymentId,
    actionType,
    actorType,
    actorId,
    actorNickname,
    note,
    createdAt: new Date().toISOString(),
  };
  LOGS.unshift(log);
  return log;
}

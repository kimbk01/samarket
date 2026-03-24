/**
 * 33단계: 배포 실행 / 롤백 실행 (activeFeedVersions + deployments + logs 연동)
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";
import { setLiveVersion, rollbackToPrevious } from "./mock-active-feed-versions";
import { addRecommendationDeployment } from "./mock-recommendation-deployments";
import { addRecommendationDeploymentLog } from "./mock-recommendation-deployment-logs";
import { getActiveFeedVersionBySurface } from "./mock-active-feed-versions";

const ADMIN_ID = "admin1";
const ADMIN_NICKNAME = "관리자";

export interface DeployVersionParams {
  surface: RecommendationSurface;
  versionId: string;
  deploymentName: string;
  sourceExperimentId?: string | null;
  rolloutType?: "full" | "partial" | "staged";
  rolloutPercent?: number;
  note?: string;
}

export function deployVersion(params: DeployVersionParams): { deploymentId: string } {
  const {
    surface,
    versionId,
    deploymentName,
    sourceExperimentId = null,
    rolloutType = "full",
    rolloutPercent = 100,
    note = "",
  } = params;

  const active = getActiveFeedVersionBySurface(surface);
  const previousVersionId = active?.liveVersionId ?? null;

  setLiveVersion(surface, versionId, ADMIN_ID, ADMIN_NICKNAME);

  const deployment = addRecommendationDeployment({
    surface,
    deploymentName,
    sourceExperimentId,
    deployedVersionId: versionId,
    previousVersionId,
    deploymentStatus: "success",
    rolloutType,
    rolloutPercent,
    deployedAt: new Date().toISOString(),
    scheduledAt: null,
    note,
    createdAt: new Date().toISOString(),
    createdByAdminId: ADMIN_ID,
    createdByAdminNickname: ADMIN_NICKNAME,
  });

  addRecommendationDeploymentLog(
    deployment.id,
    "deploy",
    note || `${deploymentName} 배포 완료`,
    "admin",
    ADMIN_ID,
    ADMIN_NICKNAME
  );

  return { deploymentId: deployment.id };
}

export function rollbackSurface(
  surface: RecommendationSurface
): { success: boolean } {
  const active = getActiveFeedVersionBySurface(surface);
  if (!active?.previousVersionId) return { success: false };

  const prevId = active.previousVersionId;
  rollbackToPrevious(surface, ADMIN_ID, ADMIN_NICKNAME);

  const deployment = addRecommendationDeployment({
    surface,
    deploymentName: `롤백: ${surface}`,
    sourceExperimentId: null,
    deployedVersionId: prevId,
    previousVersionId: active.liveVersionId,
    deploymentStatus: "rolled_back",
    rolloutType: "full",
    rolloutPercent: 100,
    deployedAt: new Date().toISOString(),
    scheduledAt: null,
    note: "수동 롤백",
    createdAt: new Date().toISOString(),
    createdByAdminId: ADMIN_ID,
    createdByAdminNickname: ADMIN_NICKNAME,
  });

  addRecommendationDeploymentLog(
    deployment.id,
    "rollback",
    "이전 버전으로 롤백",
    "admin",
    ADMIN_ID,
    ADMIN_NICKNAME
  );

  return { success: true };
}

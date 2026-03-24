/**
 * 33단계: 추천 버전 배포 / 운영 버전 / 롤백 / 실험 승자 타입
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";

export type { RecommendationSurface } from "@/lib/types/recommendation";

export type DeploymentStatus =
  | "scheduled"
  | "deploying"
  | "success"
  | "rolled_back"
  | "failed";

export type RolloutType = "full" | "partial" | "staged";

export interface RecommendationDeployment {
  id: string;
  surface: RecommendationSurface;
  deploymentName: string;
  sourceExperimentId: string | null;
  deployedVersionId: string;
  previousVersionId: string | null;
  deploymentStatus: DeploymentStatus;
  rolloutType: RolloutType;
  rolloutPercent: number;
  deployedAt: string;
  scheduledAt: string | null;
  note: string;
  createdAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
}

export interface ActiveFeedVersion {
  id: string;
  surface: RecommendationSurface;
  liveVersionId: string;
  previousVersionId: string | null;
  rolloutPercent: number;
  updatedAt: string;
  updatedByAdminId: string;
  updatedByAdminNickname: string;
}

export type DeploymentLogActionType =
  | "create"
  | "schedule"
  | "deploy"
  | "rollback"
  | "archive"
  | "choose_winner";

export interface RecommendationDeploymentLog {
  id: string;
  deploymentId: string;
  actionType: DeploymentLogActionType;
  actorType: "admin" | "system";
  actorId: string;
  actorNickname: string;
  note: string;
  createdAt: string;
}

export type WinningGroup = "control" | "variant_a" | "variant_b";

export type WinningMetric = "ctr" | "conversion_rate" | "composite_score";

export interface ExperimentWinnerSummary {
  experimentId: string;
  winningVersionId: string;
  winningGroup: WinningGroup;
  winningMetric: WinningMetric;
  winningValue: number;
  comparedAt: string;
  autoDeployRecommended: boolean;
}

export interface RecommendationRollbackPolicy {
  id: string;
  surface: RecommendationSurface;
  autoRollbackEnabled: boolean;
  minCtrThreshold: number;
  minConversionRateThreshold: number;
  maxErrorRateThreshold: number;
  compareWindowHours: number;
  updatedAt: string;
  adminMemo: string;
}

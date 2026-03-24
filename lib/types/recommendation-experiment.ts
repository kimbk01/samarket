/**
 * 32단계: 추천 A/B 실험 / 피드 버전 / 사용자 배정 / 실험 성과·로그 타입
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";

export type { RecommendationSurface } from "@/lib/types/recommendation";

export type ExperimentStatus = "draft" | "running" | "paused" | "ended";

export type TrafficAllocationType =
  | "percentage"
  | "region_based"
  | "member_type_based";

export interface RecommendationExperiment {
  id: string;
  experimentName: string;
  description: string;
  status: ExperimentStatus;
  targetSurface: RecommendationSurface;
  controlVersionId: string;
  variantVersionIds: string[];
  trafficAllocationType: TrafficAllocationType;
  controlPercentage: number;
  variantPercentages: number[];
  targetRegions: string[];
  targetMemberTypes: string[];
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
  adminMemo?: string;
}

export type FeedVersionSurface = "home" | "search" | "shop";

export interface SectionConfigEntry {
  sectionKey: string;
  isActive: boolean;
  maxItems?: number;
  sortMode?: string;
}

export interface ScoringOverrides {
  premiumBoostWeight?: number;
  businessBoostWeight?: number;
  adBoostWeight?: number;
  pointPromotionBoostWeight?: number;
  bumpBoostWeight?: number;
  [key: string]: number | undefined;
}

export interface FeedVersion {
  id: string;
  versionKey: string;
  versionName: string;
  surface: FeedVersionSurface;
  isActive: boolean;
  sectionConfig: SectionConfigEntry[];
  scoringOverrides: ScoringOverrides;
  dedupeStrategy: "global" | "per_section";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type AssignedGroup = "control" | "variant_a" | "variant_b";

export interface UserFeedAssignment {
  id: string;
  userId: string;
  experimentId: string;
  assignedVersionId: string;
  assignedGroup: AssignedGroup;
  assignedAt: string;
  region: string;
  memberType: string;
}

export interface ExperimentMetrics {
  id: string;
  experimentId: string;
  versionId: string;
  assignedUsers: number;
  impressionCount: number;
  clickCount: number;
  conversionCount: number;
  ctr: number;
  conversionRate: number;
  avgScore: number;
  updatedAt: string;
}

export type ExperimentLogActionType =
  | "create"
  | "update"
  | "start"
  | "pause"
  | "end"
  | "assign_user"
  | "choose_winner";

export type ExperimentLogActorType = "admin" | "system";

export interface ExperimentLog {
  id: string;
  experimentId: string;
  actionType: ExperimentLogActionType;
  actorType: ExperimentLogActorType;
  actorId: string;
  actorNickname: string;
  note: string;
  createdAt: string;
}

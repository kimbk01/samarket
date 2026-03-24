/**
 * 34단계: 피드 장애 대응 / kill switch / 섹션 비활성화 / fallback 타입
 */

import type { RecommendationSurface } from "@/lib/types/recommendation";

export type FeedFallbackMode =
  | "previous_live_version"
  | "safe_default_feed"
  | "local_latest_only"
  | "static_slots_only";

export interface FeedEmergencyPolicy {
  id: string;
  surface: RecommendationSurface;
  killSwitchEnabled: boolean;
  fallbackEnabled: boolean;
  fallbackMode: FeedFallbackMode;
  autoDisableEnabled: boolean;
  errorRateThreshold: number;
  emptyFeedThreshold: number;
  ctrDropThreshold: number;
  emergencyNoticeEnabled: boolean;
  emergencyNoticeText: string;
  updatedAt: string;
  adminMemo: string;
}

export type FeedSectionOverrideKey =
  | "recommended"
  | "local_latest"
  | "bumped"
  | "sponsored"
  | "premium_shops"
  | "recent_based"
  | "category_based"
  | "interest_based";

export interface FeedSectionOverride {
  id: string;
  surface: RecommendationSurface;
  sectionKey: FeedSectionOverrideKey;
  isForcedDisabled: boolean;
  reason: string;
  updatedAt: string;
  updatedByAdminId: string;
  updatedByAdminNickname: string;
}

export type FeedFallbackModeState = "normal" | "fallback" | "kill_switch";

export interface FeedFallbackState {
  id: string;
  surface: RecommendationSurface;
  currentMode: FeedFallbackModeState;
  activeVersionId: string | null;
  fallbackVersionId: string | null;
  fallbackReason: string;
  startedAt: string;
  updatedAt: string;
}

export type FeedEmergencyActionType =
  | "enable_kill_switch"
  | "disable_kill_switch"
  | "enable_fallback"
  | "disable_fallback"
  | "disable_section"
  | "enable_section"
  | "auto_fallback"
  | "rollback_to_previous";

export interface FeedEmergencyLog {
  id: string;
  surface: RecommendationSurface;
  actionType: FeedEmergencyActionType;
  actorType: "admin" | "system";
  actorId: string;
  actorNickname: string;
  sectionKey: FeedSectionOverrideKey | null;
  note: string;
  createdAt: string;
}

export interface StableFeedVersion {
  id: string;
  surface: RecommendationSurface;
  versionId: string;
  stabilityScore: number;
  avgCtr: number;
  avgConversionRate: number;
  markedAt: string;
  note: string;
}

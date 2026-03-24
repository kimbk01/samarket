/**
 * 27단계: 회원 혜택 정책 / 로그 / 시각 설정 타입 (14단계 memberType 호환)
 */

import type { MemberType } from "@/lib/types/admin-user";

export type { MemberType };

export type ProfileFrameType = "dark" | "gold" | "admin_special";

export interface MemberBenefitPolicy {
  id: string;
  memberType: MemberType;
  title: string;
  description: string;
  isActive: boolean;
  profileFrameType: ProfileFrameType;
  badgeLabel: string;
  homePriorityBoost: number;
  searchPriorityBoost: number;
  shopFeaturedPriorityBoost: number;
  pointRewardBonusRate: number;
  adDiscountRate: number;
  productLimitPerMonth?: number;
  canOpenBusinessProfile: boolean;
  canAccessPremiumPromotion: boolean;
  createdAt: string;
  updatedAt: string;
  adminMemo?: string;
}

export type MemberBenefitLogActionType =
  | "assign"
  | "update"
  | "revoke"
  | "apply_priority"
  | "apply_bonus";

export type MemberBenefitLogActorType = "admin" | "system";

export interface MemberBenefitLog {
  id: string;
  userId: string;
  userNickname: string;
  memberType: MemberType;
  policyId: string;
  actionType: MemberBenefitLogActionType;
  note: string;
  actorType: MemberBenefitLogActorType;
  actorId: string;
  actorNickname: string;
  createdAt: string;
}

export interface MemberVisualConfig {
  memberType: MemberType;
  frameType: ProfileFrameType;
  badgeLabel: string;
  textClassName?: string;
  accentType?: string;
}

export interface MemberBenefitSummary {
  memberType: MemberType;
  activePolicyCount: number;
  totalUsers: number;
  totalAppliedLogs: number;
  latestUpdatedAt: string | null;
}

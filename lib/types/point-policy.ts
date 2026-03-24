/**
 * 24단계: 커뮤니티 포인트 정책 타입
 */

export type PointRewardType = "fixed" | "random";

export interface BoardPointPolicy {
  id: string;
  boardKey: string;
  boardName: string;
  isActive: boolean;
  writeRewardType: PointRewardType;
  writeFixedPoint: number;
  writeRandomMin: number;
  writeRandomMax: number;
  writeCooldownSeconds: number;
  commentRewardType: PointRewardType;
  commentFixedPoint: number;
  commentRandomMin: number;
  commentRandomMax: number;
  commentCooldownSeconds: number;
  likeRewardPoint: number;
  reportRewardPoint: number;
  maxFreeUserPointCap: number;
  eventMultiplierEnabled: boolean;
  updatedAt: string;
  adminMemo?: string;
}

export type PointProbabilityTargetType = "write" | "comment";

export interface PointProbabilityRule {
  id: string;
  policyId: string;
  targetType: PointProbabilityTargetType;
  minPoint: number;
  maxPoint: number;
  probabilityPercent: number;
  sortOrder: number;
}

export interface PointEventPolicy {
  id: string;
  title: string;
  isActive: boolean;
  startAt: string;
  endAt: string;
  writeMultiplier: number;
  commentMultiplier: number;
  targetBoards: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type PointPolicyLogPolicyType =
  | "board_policy"
  | "probability_rule"
  | "event_policy";

export type PointPolicyLogActionType =
  | "create"
  | "update"
  | "activate"
  | "deactivate"
  | "simulate";

export interface PointPolicyLog {
  id: string;
  policyType: PointPolicyLogPolicyType;
  relatedId: string;
  actionType: PointPolicyLogActionType;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}

export interface PointRewardSimulation {
  boardKey: string;
  actionType: "write" | "comment";
  userType: "free" | "premium";
  currentPointBalance: number;
  basePoint: number;
  rewardPoint: number;
  appliedMultiplier: number;
  capped: boolean;
  cooldownBlocked: boolean;
}

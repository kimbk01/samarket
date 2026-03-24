/**
 * 25단계: 포인트 지급 실행 / 회수 정책 / 리워드 로그 타입
 */

export type PointRewardActionType = "write" | "comment";

export type PointRewardTargetType = "post" | "comment";

export type PointRewardUserType = "free" | "premium";

export type PointRewardExecutionStatus = "success" | "blocked" | "reversed";

export interface PointRewardExecution {
  id: string;
  executionKey: string;
  boardKey: string;
  actionType: PointRewardActionType;
  targetId: string;
  targetType: PointRewardTargetType;
  userId: string;
  userNickname: string;
  userType: PointRewardUserType;
  rewardType: "fixed" | "random";
  basePoint: number;
  appliedMultiplier: number;
  finalPoint: number;
  capped: boolean;
  cooldownBlocked: boolean;
  duplicateBlocked: boolean;
  status: PointRewardExecutionStatus;
  reason?: string;
  createdAt: string;
  reversedAt?: string;
}

export type PointReclaimTargetType = "post" | "comment";

export type PointReclaimTriggerType =
  | "delete"
  | "admin_remove"
  | "report_confirmed";

export type PointReclaimMode = "full" | "partial";

export interface PointReclaimPolicy {
  id: string;
  targetType: PointReclaimTargetType;
  triggerType: PointReclaimTriggerType;
  reclaimMode: PointReclaimMode;
  reclaimPercent: number;
  isActive: boolean;
  updatedAt: string;
}

export type PointRewardLogActionType = "reward" | "reclaim";

export interface PointRewardLog {
  id: string;
  executionId: string;
  relatedLedgerId: string;
  actionType: PointRewardLogActionType;
  boardKey: string;
  targetId: string;
  targetType: PointRewardTargetType;
  userId: string;
  pointAmount: number;
  balanceAfter: number;
  note: string;
  createdAt: string;
}

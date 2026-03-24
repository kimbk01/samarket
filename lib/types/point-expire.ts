/**
 * 26단계: 포인트 만료 정책 / 실행 / 로그 타입
 */

export type PointExpireEntryTypeExclude =
  | "charge"
  | "reward"
  | "bonus"
  | "admin_adjust";

export type PointExpireRunCycle = "daily" | "weekly" | "monthly";

export interface PointExpirePolicy {
  id: string;
  policyName: string;
  isActive: boolean;
  expireAfterDays: number;
  minBalanceToExpire?: number;
  excludeEntryTypes: PointExpireEntryTypeExclude[];
  allowUserView: boolean;
  autoExpireEnabled: boolean;
  runCycle: PointExpireRunCycle;
  updatedAt: string;
  adminMemo?: string;
}

export type PointExpireExecutionStatus =
  | "simulated"
  | "success"
  | "skipped"
  | "failed";

export interface PointExpireExecution {
  id: string;
  executionDate: string;
  policyId: string;
  targetUserId: string;
  targetUserNickname: string;
  totalCandidatePoint: number;
  expiredPoint: number;
  remainingPoint: number;
  executionStatus: PointExpireExecutionStatus;
  reason?: string;
  createdAt: string;
}

export type PointExpireLogActionType = "preview" | "expire" | "rollback";

export type PointExpireLogActorType = "admin" | "system";

export interface PointExpireLog {
  id: string;
  executionId: string;
  ledgerEntryId: string;
  userId: string;
  userNickname: string;
  expiredPoint: number;
  expiresAt: string;
  actionType: PointExpireLogActionType;
  actorType: PointExpireLogActorType;
  createdAt: string;
  note?: string;
}

export interface PointExpireUpcomingSummary {
  userId: string;
  totalExpiringPoint: number;
  nearestExpireAt: string | null;
  expiringEntriesCount: number;
}

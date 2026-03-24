/**
 * 11단계: 신고·차단·제재 타입 (관리자 확장 시 활용)
 */

export type ReportTargetType = "product" | "chat" | "user" | "community";

export type ReportStatus = "pending" | "reviewing" | "resolved" | "rejected" | "sanctioned" | "reviewed";

export interface Report {
  id: string;
  reporterId: string;
  reporterNickname?: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  targetTitle?: string;
  reasonCode: string;
  reasonLabel: string;
  detail: string;
  createdAt: string;
  status: ReportStatus;
  /** 관리자 처리자 (신고 목록/상세) */
  resolvedBy?: string;
  resolvedAt?: string;
  productTitle?: string;
  /** 통합 목록: 기본 reports vs 동네생활 피드 */
  reportSource?: "reports" | "community_feed";
  /** 목록에서 상세 링크 (피드 신고는 전용 화면으로) */
  adminDetailHref?: string;
}

export interface BlockedUser {
  id: string;
  userId: string;
  blockedUserId: string;
  blockedUserNickname?: string;
  createdAt: string;
}

export type ModerationStatus = "normal" | "warned" | "suspended" | "banned";

export interface UserModerationState {
  userId: string;
  /** 12단계: 관리자 목록 표시용 */
  nickname?: string;
  status: ModerationStatus;
  reason?: string;
  updatedAt: string;
}

/** 12단계: 관리자 처리 이력 */
export type ModerationActionType =
  | "warn"
  | "suspend"
  | "ban"
  | "blind_product"
  | "delete_product"
  | "reject_report"
  | "review_only";

export interface ModerationAction {
  id: string;
  reportId: string;
  targetUserId: string;
  targetType: ReportTargetType;
  actionType: ModerationActionType;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}

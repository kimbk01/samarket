/**
 * 14단계: 관리자 회원관리 타입 (11·12단계 제재 상태와 호환)
 */

import type { ModerationStatus } from "@/lib/types/report";

export type MemberType = "normal" | "premium" | "admin";

export interface AdminUser {
  id: string;
  /** 아이디 로그인(test_users.username). DB PK id와 별개 */
  loginUsername?: string;
  nickname: string;
  email?: string;
  avatar?: string;
  memberType: MemberType;
  /** normal = active 표시용 */
  moderationStatus: ModerationStatus;
  region?: string;
  city?: string;
  barangay?: string;
  location?: string;
  pointBalance?: number;
  productCount: number;
  soldCount: number;
  reviewCount: number;
  averageRating?: number;
  reportCount: number;
  chatCount: number;
  joinedAt: string;
  lastActiveAt?: string;
  adminMemo?: string;
}

export type UserModerationLogActionType =
  | "warn"
  | "suspend"
  | "ban"
  | "restore"
  | "upgrade_premium"
  | "downgrade_premium";

export interface UserModerationLog {
  id: string;
  userId: string;
  fromStatus: ModerationStatus;
  toStatus: ModerationStatus;
  actionType: UserModerationLogActionType;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}

export interface UserActivitySummary {
  userId: string;
  activeProducts: number;
  soldProducts: number;
  favoriteCount: number;
  reviewCount: number;
  averageRating: number;
  reportCount: number;
  blockedCount: number;
  chatRoomCount: number;
}

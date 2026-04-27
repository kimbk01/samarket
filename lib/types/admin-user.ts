/**
 * 14단계: 관리자 회원관리 타입 (11·12단계 제재 상태와 호환)
 */

import type { ModerationStatus } from "@/lib/types/report";

export type MemberType = "normal" | "premium" | "admin";
export type AdminAuthProvider =
  | "google"
  | "kakao"
  | "naver"
  | "apple"
  | "facebook"
  | "email"
  | "manual"
  | "unknown";

export interface AdminUser {
  id: string;
  /** 아이디 로그인(test_users.username). DB PK id와 별개 */
  loginUsername?: string;
  /** 운영 목록 표시용 실제 로그인 식별값(SNS email/provider id/manual login_id) */
  loginIdentifier?: string;
  nickname: string;
  email?: string;
  avatar?: string;
  authProvider?: AdminAuthProvider;
  providerLabel?: string;
  providerUserId?: string;
  phone?: string;
  phoneVerifiedAt?: string;
  verifiedMemberAt?: string;
  memberStatus?: string;
  memberType: MemberType;
  /** profiles.role 원본 — master 판별·서버 검증용 */
  profileRole?: string;
  /** profiles 행 존재 여부(목록만 test_users 인 레거시는 false) */
  hasProfile?: boolean;
  /** normal = active 표시용 */
  moderationStatus: ModerationStatus;
  region?: string;
  city?: string;
  barangay?: string;
  location?: string;
  pointBalance?: number;
  phoneVerified?: boolean;
  verificationStatus?: string;
  productCount: number;
  soldCount: number;
  reviewCount: number;
  averageRating?: number;
  reportCount: number;
  chatCount: number;
  joinedAt: string;
  lastSignInAt?: string;
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

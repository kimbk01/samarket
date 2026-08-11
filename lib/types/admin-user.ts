/**
 * 14단계: 관리자 회원관리 타입 (11·12단계 제재 상태와 호환)
 */

import type { ModerationStatus } from "@/lib/types/report";
import type { AdminMemberRoleBadge } from "@/lib/admin-users/member-role-badges";

export type MemberType = "normal" | "premium" | "admin";
/** List tab/query compat only — not Person identity SSOT. */
export type AdminAccountCategory = "member" | "store_manager" | "admin";
export type { AdminMemberRoleBadge };
export type AdminUserStatusCategory = "active" | "needs_review" | "suspended" | "deleted";
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
  /** 아이디 로그인 표시용(profiles.username) */
  loginUsername?: string;
  /** 운영 목록 표시용 실제 로그인 식별값(SNS email/provider id/manual login_id) */
  loginIdentifier?: string;
  /** profiles.username (@아이디, DB에는 @ 없이 저장) */
  username?: string | null;
  /** profiles.dibay_id — 공개 @id (확정 후 변경 불가) */
  dibay_id?: string | null;
  dibay_id_locked?: boolean;
  dibay_id_auto_assigned?: boolean;
  dibay_id_initial?: string | null;
  dibay_id_changed_once?: boolean;
  dibay_id_changed_at?: string | null;
  onboarding_status?: string | null;
  onboarding_completed_at?: string | null;
  /** profiles.display_name (닉네임) */
  displayName?: string | null;
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
  /** Legacy Lite 목록 분류 — admin: membership/role · store_manager: stores.owner · else member */
  accountCategory?: AdminAccountCategory;
  roleCategory?: AdminAccountCategory;
  /** PHASE E Person Directory — from stores.owner_user_id (not profiles.role) */
  storeRelation?: {
    count: number;
    hasApproved: boolean;
    stores?: Array<{
      id: string;
      name: string;
      slug?: string | null;
      approvalStatus: string | null;
      isVisible: boolean | null;
      connectedAt: string | null;
    }>;
  };
  /** Additive badges: member + optional store_owner + admin|super_admin. */
  roleBadges?: AdminMemberRoleBadge[];
  /** Active admin_memberships only. */
  hasAdminMembership?: boolean;
  /** Active admin_memberships.role === super_admin */
  isSuperAdmin?: boolean;
  /** Legacy Lite 상태 분류 — 목록 표시·필터용 */
  statusCategory?: AdminUserStatusCategory;
  /**
   * profiles 행 존재 여부.
   * true = SSOT 회원 · false = auth-only 예외(목록·상세 읽기 전용).
   */
  hasProfile?: boolean;
  /** normal = active 표시용 */
  moderationStatus: ModerationStatus;
  region?: string;
  city?: string;
  barangay?: string;
  location?: string;
  /** List omits this. Detail ledger SSOT is GET /points — never profiles.points. */
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
  /** App session clock = profiles.last_login_at. Do not alias as lastActiveAt. */
  lastSignInAt?: string;
  /** Forbidden as last_login_at alias. Domain activity belongs on detail tabs. */
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

/** 관리자 회원 상세 API `user` 페이로드 — profiles SSOT + hasProfile 계약 (상세 UI·AdminUserDetailPayload) */
export interface AdminUserDetail {
  id: string;
  username: string | null;
  dibay_id?: string | null;
  dibay_id_locked?: boolean;
  dibay_id_auto_assigned?: boolean;
  dibay_id_initial?: string | null;
  dibay_id_changed_once?: boolean;
  dibay_id_changed_at?: string | null;
  email: string | null;
  role: string;
  display_name: string | null;
  nickname: string | null;
  contact_phone: string | null;
  contact_address: string | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  phone_verification_status: string;
  member_status: string | null;
  member_type: string | null;
  status: string | null;
  deleted_at: string | null;
  moderation_status: string;
  verified_member_at: string | null;
  created_at: string | null;
  /** App last login — profiles.last_login_at. Not Auth last_sign_in_at. */
  last_login_at?: string | null;
  /** profiles.region_name — list/detail region line. Not user_addresses. */
  region_name?: string | null;
  hasProfile: boolean;
  /** User Facts Trust SSOT — profiles.trust_score (0–100) */
  trust_score?: number | null;
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

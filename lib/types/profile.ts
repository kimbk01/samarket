/**
 * 마이페이지 프로필 타입 (Supabase profiles 테이블 연동용)
 */
export interface Profile {
  id: string;
  email: string;
  display_name?: string | null;
  nickname: string;
  avatar_url: string | null;
  username?: string | null;
  dibay_id?: string | null;
  dibay_id_locked?: boolean;
  dibay_id_auto_assigned?: boolean;
  /** DB 생성 컬럼 — none · auto(숫자5+영어3, 안 바꿈) · auto_legacy(dibay… 안 바꿈) · custom */
  dibay_id_state?: "none" | "auto" | "auto_legacy" | "custom" | null;
  /** DB 생성 컬럼 — 회원 본인 1회 변경 가능 */
  dibay_id_can_change?: boolean | null;
  dibay_id_changed_once?: boolean;
  dibay_id_changed_at?: string | null;
  username_confirmed?: boolean | null;
  onboarding_status?: string | null;
  onboarding_completed_at?: string | null;
  profile_completed?: boolean;
  role?: string;
  /**
   * Canonical Admin fact from server (`/api/me/profile` pipeline).
   * Membership-only — never invent from `role` / `is_admin` on the client.
   */
  privilegedAdmin?: boolean;
  status?: string;
  member_type?: string;
  phone?: string | null;
  phone_country_code?: string | null;
  phone_number?: string | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  phone_verification_status?: string;
  phone_verification_method?: string | null;
  auth_login_email?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  member_status?: string | null;
  is_admin?: boolean;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
  deleted_at?: string | null;
  manual_account_type?: string | null;
  /** 신뢰 점수 0~100 (배터리). 레거시 mock 36.5는 50으로 통일 권장 */
  temperature: number;
  trust_score?: number | null;
}

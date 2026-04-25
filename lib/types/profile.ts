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
  role?: string;
  status?: string;
  member_type?: string;
  phone?: string | null;
  phone_country_code?: string | null;
  phone_number?: string | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  phone_verification_status?: string;
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

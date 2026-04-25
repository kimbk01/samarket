/**
 * profiles 테이블 기준 타입 (Supabase 단일 원본)
 * - 내정보 메인·프로필 수정과 관리자 회원관리가 동일 테이블 사용 (별도 프로필 테이블 없음)
 * - 관리자 회원관리: 리스트/상세 조회·포인트·인증상태·회원구분 모두 profiles 기준
 *
 * 테이블 예시 (Supabase):
 *   id uuid PK references auth.users(id),
 *   email, nickname, avatar_url, bio, region_code, region_name, phone,
 *   phone_verified bool, realname_verified bool, status text, role text,
 *   member_type text default 'normal', points int, manner_score numeric, trust_score numeric default 50,
 *   preferred_language, preferred_country, created_at, updated_at timestamptz
 */

export interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  username?: string | null;
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
  region_code: string | null;
  region_name: string | null;
  /** 지번·건물·번지 등 (매장 주소 입력과 동일 의미) */
  address_street_line: string | null;
  /** 동·호·출입 등 */
  address_detail: string | null;
  /** Google Maps 핀 위도 (프로필 위치 선택) */
  latitude: number | null;
  /** Google Maps 핀 경도 */
  longitude: number | null;
  /** 역지오코딩 전체 주소 */
  full_address: string | null;
  phone: string | null;
  phone_country_code?: string | null;
  phone_number?: string | null;
  phone_verified: boolean;
  phone_verification_status: string;
  phone_verified_at?: string | null;
  auth_login_email?: string | null;
  realname: string | null;
  realname_verified: boolean;
  status: string;
  member_status?: string | null;
  role: string;
  is_admin?: boolean;
  /** normal | premium | business 등 (관리자 회원관리와 동일) */
  member_type: string;
  is_special_member: boolean;
  points: number;
  /** 매너온도 레거시 표기 */
  manner_score: number;
  /** 신뢰 점수 0~100 (배터리). 없으면 manner_score 등으로 표시용 환산 */
  trust_score?: number | null;
  preferred_language: string;
  preferred_country: string;
  /** 정책 기준 공급자. 구버전 호환용 `auth_provider` 도 함께 유지한다. */
  provider?: string | null;
  auth_provider: string | null;
  active_session_id?: string | null;
  last_login_at?: string | null;
  last_device_info?: string | null;
  created_by_admin?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
  deleted_at?: string | null;
  deletion_requested_at?: string | null;
  manual_account_type?: string | null;
  /** false면 매장(commerce) 알림 Resend 이메일 미발송 — DB 컬럼 `notify_commerce_email` (선택 마이그레이션) */
  notify_commerce_email?: boolean | null;
  created_at: string;
  updated_at: string;
}

export type ProfileUpdatePayload = Partial<
  Pick<
    ProfileRow,
    | "nickname"
    | "avatar_url"
    | "bio"
    | "region_code"
    | "region_name"
    | "address_street_line"
    | "address_detail"
    | "latitude"
    | "longitude"
    | "full_address"
    | "phone"
    | "preferred_language"
    | "preferred_country"
  >
>;

export const DEFAULT_PROFILE_ROW: ProfileRow = {
  id: "",
  email: null,
  display_name: null,
  username: null,
  nickname: null,
  avatar_url: null,
  bio: null,
  region_code: null,
  region_name: null,
  address_street_line: null,
  address_detail: null,
  latitude: null,
  longitude: null,
  full_address: null,
  phone: null,
  phone_country_code: "+63",
  phone_number: null,
  phone_verified: false,
  phone_verification_status: "unverified",
  phone_verified_at: null,
  auth_login_email: null,
  realname: null,
  realname_verified: false,
  status: "sns_pending",
  member_status: "sns_member",
  role: "user",
  is_admin: false,
  member_type: "normal",
  is_special_member: false,
  points: 0,
  manner_score: 50,
  trust_score: 50,
  preferred_language: "ko",
  preferred_country: "PH",
  provider: null,
  auth_provider: null,
  active_session_id: null,
  last_login_at: null,
  last_device_info: null,
  created_by_admin: null,
  terms_accepted_at: null,
  terms_version: null,
  privacy_accepted_at: null,
  privacy_version: null,
  deleted_at: null,
  deletion_requested_at: null,
  manual_account_type: null,
  created_at: "",
  updated_at: "",
};

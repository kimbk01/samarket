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
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
  region_code: string | null;
  region_name: string | null;
  phone: string | null;
  phone_verified: boolean;
  realname: string | null;
  realname_verified: boolean;
  status: string;
  role: string;
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
    | "phone"
    | "preferred_language"
    | "preferred_country"
  >
>;

export const DEFAULT_PROFILE_ROW: ProfileRow = {
  id: "",
  email: null,
  nickname: null,
  avatar_url: null,
  bio: null,
  region_code: null,
  region_name: null,
  phone: null,
  phone_verified: false,
  realname: null,
  realname_verified: false,
  status: "active",
  role: "user",
  member_type: "normal",
  is_special_member: false,
  points: 0,
  manner_score: 50,
  trust_score: 50,
  preferred_language: "ko",
  preferred_country: "PH",
  created_at: "",
  updated_at: "",
};
